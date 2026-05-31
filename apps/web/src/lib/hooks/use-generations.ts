"use client";

import { useEffect, useRef } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { AiGeneration, GeneratedMessage } from "@bespoke/db";
import { apiClient } from "../api-client";

/** A generated message plus its parent-generation metadata. */
export interface MessageView extends GeneratedMessage {
  generationStatus: AiGeneration["status"];
  model: string;
}

export interface CreateGenerationInput {
  offeringId: string;
  promptId: string;
  prospectId: string;
}

/** A single generation with its produced message (null until the worker finishes). */
export interface GenerationDetail extends AiGeneration {
  message: GeneratedMessage | null;
  /** Error from the generation worker — only set when status is "failed". */
  failureReason: string | null;
}

const generationKeys = {
  messages: (prospectId: string) => ["generations", "prospect", prospectId] as const,
  detail: (id: string) => ["generations", "detail", id] as const,
};

/**
 * Poll one generation by id while it is still in flight. The produced message is
 * only attached once the worker completes, so consumers wait on `status` +
 * `message`. Polling stops as soon as the generation settles.
 */
export function useGeneration(id: string | null) {
  return useQuery({
    queryKey: generationKeys.detail(id ?? ""),
    queryFn: () => apiClient.get<GenerationDetail>(`/api/generations/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "processing" ? 2000 : false;
    },
  });
}

/**
 * Poll one generation and fire a toast.error when the worker fails. Call this
 * after `useCreateGeneration` succeeds, passing the returned generation id.
 * Polling stops automatically once the generation settles.
 */
export function useWatchGeneration(id: string | null) {
  // undefined = not yet initialized (skip transition check on first data load)
  const prevStatus = useRef<string | null | undefined>(undefined);

  const query = useQuery({
    queryKey: generationKeys.detail(id ?? ""),
    queryFn: () => apiClient.get<GenerationDetail>(`/api/generations/${id}`),
    enabled: Boolean(id),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === "pending" || status === "processing" ? 2000 : false;
    },
  });

  useEffect(() => {
    if (!query.data) return;
    const curr = query.data.status;
    if (prevStatus.current !== undefined) {
      const prev = prevStatus.current;
      if ((prev === "pending" || prev === "processing") && curr === "failed") {
        toast.error(query.data.failureReason ?? "Generation failed");
      }
    }
    prevStatus.current = curr;
  }, [query.data]);

  return query;
}

/** The history list of generated messages for one prospect. */
export function useMessages(prospectId: string) {
  return useQuery({
    queryKey: generationKeys.messages(prospectId),
    queryFn: () =>
      apiClient.get<MessageView[]>(
        `/api/generations?prospectId=${prospectId}`,
      ),
    enabled: Boolean(prospectId),
    // Poll while any message is still being generated.
    refetchInterval: (query) =>
      query.state.data?.some(
        (m) =>
          m.generationStatus === "pending" ||
          m.generationStatus === "processing",
      )
        ? 2000
        : false,
  });
}

export function useCreateGeneration(prospectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGenerationInput) =>
      apiClient.post<AiGeneration>("/api/generations", input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: generationKeys.messages(prospectId),
      }),
  });
}

function useMessageAction<TVars>(
  prospectId: string,
  fn: (vars: TVars) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: generationKeys.messages(prospectId),
      }),
  });
}

export function useRateMessage(prospectId: string) {
  return useMessageAction(
    prospectId,
    (vars: { id: string; rating: number; feedback?: string }) =>
      apiClient.patch(`/api/messages/${vars.id}/rating`, {
        rating: vars.rating,
        feedback: vars.feedback,
      }),
  );
}

export function useFavoriteMessage(prospectId: string) {
  return useMessageAction(
    prospectId,
    (vars: { id: string; isFavorite: boolean }) =>
      apiClient.patch(`/api/messages/${vars.id}/favorite`, {
        isFavorite: vars.isFavorite,
      }),
  );
}

export function useCopyMessage(prospectId: string) {
  return useMessageAction(prospectId, (id: string) =>
    apiClient.post(`/api/messages/${id}/copy`),
  );
}

export function useDeleteMessage(prospectId: string) {
  return useMessageAction(prospectId, (id: string) =>
    apiClient.delete(`/api/messages/${id}`),
  );
}

export function useRegenerateMessage(prospectId: string) {
  return useMessageAction(prospectId, (id: string) =>
    apiClient.post(`/api/messages/${id}/regenerate`),
  );
}
