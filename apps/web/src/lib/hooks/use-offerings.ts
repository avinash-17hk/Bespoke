"use client";

import { useEffect, useRef } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { Offering, OfferingSource } from "@bespoke/db";
import type { CursorPage } from "@bespoke/shared";
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

export type OfferingWithSources = Offering & { sources: OfferingSource[] };

export interface CreateOfferingInput {
  name: string;
  description?: string;
  targetAudience?: string;
  problemSolved?: string;
  uniqueValueProp?: string;
  proofPoints?: string;
  sourceUrl?: string;
  sourceUrls?: string[];
}

export type UpdateOfferingInput = Partial<
  Omit<CreateOfferingInput, "sourceUrl" | "sourceUrls">
>;

const PAGE_SIZE = 20;

const offeringKeys = {
  lists: ["offerings", "list"] as const,
  list: (q: string) => ["offerings", "list", { q }] as const,
  detail: (id: string) => ["offerings", id] as const,
};

/** Build an optimistic Offering row from create input (temp id, draft status). */
function optimisticOffering(input: CreateOfferingInput): Offering {
  const now = new Date();
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    userId: "",
    name: input.name,
    description: input.description ?? null,
    targetAudience: input.targetAudience ?? null,
    problemSolved: input.problemSolved ?? null,
    uniqueValueProp: input.uniqueValueProp ?? null,
    proofPoints: input.proofPoints ?? null,
    compiledContext: null,
    // Any URL means a background scrape is starting — pulse immediately.
    status:
      input.sourceUrl || input.sourceUrls?.length ? "scraping" : "draft",
    createdAt: now,
    updatedAt: now,
  } as Offering;
}

/** Cursor-paginated, searchable offering list for the Offerings tab. */
export function useOfferingsInfinite(q: string, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: offeringKeys.list(q),
    queryFn: ({ pageParam }) =>
      apiClient.get<CursorPage<Offering>>(
        `/api/offerings${listSearchParams({ cursor: pageParam, q, limit: PAGE_SIZE })}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
  return { ...query, items: flattenPages(query.data) };
}

export function useOffering(id: string) {
  return useQuery({
    queryKey: offeringKeys.detail(id),
    queryFn: () => apiClient.get<OfferingWithSources>(`/api/offerings/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * While an offering is scraping (real row only), poll its detail until the
 * worker flips it off `scraping`. On that transition, toast the user and
 * refresh the lists so the card stops pulsing and renders its final status.
 */
export function useWatchOfferingScrape(offering: Offering) {
  const queryClient = useQueryClient();
  const watching = offering.status === "scraping" && !isOptimisticId(offering.id);
  const lastStatus = useRef(offering.status);

  const { data } = useQuery({
    queryKey: offeringKeys.detail(offering.id),
    queryFn: () =>
      apiClient.get<OfferingWithSources>(`/api/offerings/${offering.id}`),
    enabled: watching,
    refetchInterval: (query) =>
      query.state.data?.status === "scraping" ? 2500 : false,
  });

  useEffect(() => {
    if (!data) return;
    if (lastStatus.current === "scraping" && data.status !== "scraping") {
      toast.success(`“${data.name}” is ready`);
      void queryClient.invalidateQueries({ queryKey: offeringKeys.lists });
    }
    lastStatus.current = data.status;
  }, [data, queryClient]);
}

export function useCreateOffering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOfferingInput) =>
      apiClient.post<OfferingWithSources>("/api/offerings", input),
    onMutate: async (input): Promise<{ snapshot: ListSnapshot }> => {
      const snapshot = await snapshotLists(queryClient, offeringKeys.lists);
      prependToLists(queryClient, offeringKeys.lists, optimisticOffering(input));
      return { snapshot };
    },
    onError: (error, _input, context) => {
      if (context) restoreLists(queryClient, context.snapshot);
      toast.error(error.message);
    },
    onSuccess: () => toast.success("Offering created"),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: offeringKeys.lists }),
  });
}

export function useUpdateOffering(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateOfferingInput) =>
      apiClient.patch<OfferingWithSources>(`/api/offerings/${id}`, input),
    onSuccess: () => {
      toast.success("Offering saved");
      void queryClient.invalidateQueries({ queryKey: offeringKeys.lists });
      void queryClient.invalidateQueries({ queryKey: offeringKeys.detail(id) });
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useDeleteOffering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/offerings/${id}`),
    onMutate: async (id): Promise<{ snapshot: ListSnapshot }> => {
      const snapshot = await snapshotLists(queryClient, offeringKeys.lists);
      removeFromLists(queryClient, offeringKeys.lists, new Set([id]));
      return { snapshot };
    },
    onError: (error, _id, context) => {
      if (context) restoreLists(queryClient, context.snapshot);
      toast.error(error.message);
    },
    onSuccess: () => toast.success("Offering deleted"),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: offeringKeys.lists }),
  });
}

export function useBatchDeleteOfferings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiClient.post<{ deleted: number }>("/api/offerings/batch-delete", {
        ids,
      }),
    onMutate: async (ids): Promise<{ snapshot: ListSnapshot }> => {
      const snapshot = await snapshotLists(queryClient, offeringKeys.lists);
      removeFromLists(queryClient, offeringKeys.lists, new Set(ids));
      return { snapshot };
    },
    onError: (error, _ids, context) => {
      if (context) restoreLists(queryClient, context.snapshot);
      toast.error(error.message);
    },
    onSuccess: ({ deleted }) =>
      toast.success(`${deleted} offering${deleted === 1 ? "" : "s"} deleted`),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: offeringKeys.lists }),
  });
}

export function useAddOfferingSource(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string) =>
      apiClient.post<OfferingWithSources>(`/api/offerings/${id}/sources`, {
        url,
      }),
    onSuccess: () => {
      toast.success("Source added, scraping in the background");
      void queryClient.invalidateQueries({ queryKey: offeringKeys.detail(id) });
    },
    onError: (error) => toast.error(error.message),
  });
}
