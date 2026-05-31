"use client";

import { useEffect, useRef } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { Prospect, ProspectAsset } from "@bespoke/db";
import type { CursorPage, ProspectAssetType } from "@bespoke/shared";
import { apiClient } from "../api-client";
import { isOptimisticId } from "../format";
import {
  flattenPages,
  listSearchParams,
  prependToLists,
  removeFromLists,
  restoreLists,
  snapshotLists,
  type ListSnapshot,
} from "./_list-cache";

export type ProspectWithDetails = Prospect & {
  assets: ProspectAsset[];
  /** True while any asset is still scraping or before context is built. */
  scraping: boolean;
};

/** List row with the derived enrichment state that drives the pulsing card. */
export type ProspectListItem = Prospect & { scraping: boolean };

export interface ProspectAssetInput {
  assetType: ProspectAssetType;
  url?: string;
  fileKey?: string;
}

export interface CreateProspectInput {
  name: string;
  email?: string;
  jobTitle?: string;
  companyName?: string;
  notes?: string;
  assets?: ProspectAssetInput[];
}

export type UpdateProspectInput = Partial<Omit<CreateProspectInput, "assets">>;

const PAGE_SIZE = 20;

const prospectKeys = {
  lists: ["prospects", "list"] as const,
  list: (q: string) => ["prospects", "list", { q }] as const,
  detail: (id: string) => ["prospects", id] as const,
};

function optimisticProspect(input: CreateProspectInput): ProspectListItem {
  const now = new Date();
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    userId: "",
    name: input.name,
    email: input.email ?? null,
    jobTitle: input.jobTitle ?? null,
    companyName: input.companyName ?? null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
    // Any attached asset means enrichment starts now — pulse immediately.
    scraping: (input.assets?.length ?? 0) > 0,
  } as ProspectListItem;
}

/** Cursor-paginated prospect list (search matches name/company/email). */
export function useProspectsInfinite(q: string, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: prospectKeys.list(q),
    queryFn: ({ pageParam }) =>
      apiClient.get<CursorPage<ProspectListItem>>(
        `/api/prospects${listSearchParams({ cursor: pageParam, q, limit: PAGE_SIZE })}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
  return { ...query, items: flattenPages(query.data) };
}

export function useProspect(id: string) {
  return useQuery({
    queryKey: prospectKeys.detail(id),
    queryFn: () => apiClient.get<ProspectWithDetails>(`/api/prospects/${id}`),
    enabled: Boolean(id),
    // Live-update per-asset status + context while enrichment is in flight.
    refetchInterval: (query) => (query.state.data?.scraping ? 2000 : false),
  });
}

/**
 * While a prospect is enriching (real row only), poll its detail until the
 * worker finishes scraping every asset and builds the context. On that
 * transition, toast the user and refresh the lists so the card stops pulsing.
 */
export function useWatchProspectScrape(prospect: ProspectListItem) {
  const queryClient = useQueryClient();
  const watching = prospect.scraping && !isOptimisticId(prospect.id);
  const wasScraping = useRef(prospect.scraping);

  const { data } = useQuery({
    queryKey: prospectKeys.detail(prospect.id),
    queryFn: () =>
      apiClient.get<ProspectWithDetails>(`/api/prospects/${prospect.id}`),
    enabled: watching,
    refetchInterval: (query) => (query.state.data?.scraping ? 2500 : false),
  });

  useEffect(() => {
    if (!data) return;
    if (wasScraping.current && !data.scraping) {
      toast.success(`“${data.name}” is ready`);
      void queryClient.invalidateQueries({ queryKey: prospectKeys.lists });
    }
    wasScraping.current = data.scraping;
  }, [data, queryClient]);
}

export function useCreateProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProspectInput) =>
      apiClient.post<ProspectWithDetails>("/api/prospects", input),
    onMutate: async (input): Promise<{ snapshot: ListSnapshot }> => {
      const snapshot = await snapshotLists(queryClient, prospectKeys.lists);
      prependToLists(queryClient, prospectKeys.lists, optimisticProspect(input));
      return { snapshot };
    },
    onError: (error, _input, context) => {
      if (context) restoreLists(queryClient, context.snapshot);
      toast.error(error.message);
    },
    onSuccess: () => toast.success("Prospect created"),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: prospectKeys.lists }),
  });
}

export function useUpdateProspect(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProspectInput) =>
      apiClient.patch<ProspectWithDetails>(`/api/prospects/${id}`, input),
    onSuccess: () => {
      toast.success("Prospect saved");
      void queryClient.invalidateQueries({ queryKey: prospectKeys.lists });
      void queryClient.invalidateQueries({ queryKey: prospectKeys.detail(id) });
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useDeleteProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/prospects/${id}`),
    onMutate: async (id): Promise<{ snapshot: ListSnapshot }> => {
      const snapshot = await snapshotLists(queryClient, prospectKeys.lists);
      removeFromLists(queryClient, prospectKeys.lists, new Set([id]));
      return { snapshot };
    },
    onError: (error, _id, context) => {
      if (context) restoreLists(queryClient, context.snapshot);
      toast.error(error.message);
    },
    onSuccess: () => toast.success("Prospect deleted"),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: prospectKeys.lists }),
  });
}

export function useBatchDeleteProspects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiClient.post<{ deleted: number }>("/api/prospects/batch-delete", {
        ids,
      }),
    onMutate: async (ids): Promise<{ snapshot: ListSnapshot }> => {
      const snapshot = await snapshotLists(queryClient, prospectKeys.lists);
      removeFromLists(queryClient, prospectKeys.lists, new Set(ids));
      return { snapshot };
    },
    onError: (error, _ids, context) => {
      if (context) restoreLists(queryClient, context.snapshot);
      toast.error(error.message);
    },
    onSuccess: ({ deleted }) =>
      toast.success(`${deleted} prospect${deleted === 1 ? "" : "s"} deleted`),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: prospectKeys.lists }),
  });
}

export function useAddProspectAsset(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (asset: ProspectAssetInput) =>
      apiClient.post<ProspectWithDetails>(`/api/prospects/${id}/assets`, asset),
    onSuccess: () => {
      toast.success("Asset added, processing in the background");
      void queryClient.invalidateQueries({ queryKey: prospectKeys.detail(id) });
      // Surface the renewed scraping state on the list card too.
      void queryClient.invalidateQueries({ queryKey: prospectKeys.lists });
    },
    onError: (error) => toast.error(error.message),
  });
}

/** Re-queue a single failed asset's scrape (allowed once per asset). */
export function useRetryProspectAsset(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) =>
      apiClient.post<ProspectWithDetails>(
        `/api/prospects/${id}/assets/${assetId}/retry`,
      ),
    onSuccess: () => {
      toast.success("Retrying, processing in the background");
      void queryClient.invalidateQueries({ queryKey: prospectKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: prospectKeys.lists });
    },
    onError: (error) => toast.error(error.message),
  });
}
