"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Conversation, ConversationMessage } from "@bespoke/db";
import type {
  ConversationParticipants,
  CursorPage,
  StartConversationCandidate,
} from "@bespoke/shared";
import { apiClient } from "../api-client";
import { listSearchParams } from "./_list-cache";

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}

/** A conversation row enriched for the list view. */
export interface ConversationListItem extends Conversation {
  participants: ConversationParticipants;
  lastMessage: {
    role: ConversationMessage["role"];
    content: string;
    createdAt: string;
  } | null;
  messageCount: number;
  awaitingReply: boolean;
}

/** A full thread plus the prospect/offering/prompt behind it. */
export interface ConversationDetail extends ConversationWithMessages {
  participants: ConversationParticipants;
}

const PAGE_SIZE = 20;

const conversationKeys = {
  all: ["conversations", "all"] as const,
  list: (prospectId: string) =>
    ["conversations", "prospect", prospectId] as const,
  detail: (id: string) => ["conversations", id] as const,
  startCandidates: ["conversations", "start-candidates"] as const,
};

/** Conversations for a prospect (infinite-paginated). */
export function useConversations(prospectId: string) {
  return useInfiniteQuery({
    queryKey: conversationKeys.list(prospectId),
    queryFn: ({ pageParam }) => {
      const base = listSearchParams({ cursor: pageParam, limit: PAGE_SIZE });
      const sep = base ? "&" : "?";
      return apiClient.get<CursorPage<ConversationListItem>>(
        `/api/conversations${base}${sep}prospectId=${prospectId}`,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(prospectId),
  });
}

/** Every conversation for the signed-in user (Conversations tab). */
export function useAllConversations() {
  return useInfiniteQuery({
    queryKey: conversationKeys.all,
    queryFn: ({ pageParam }) =>
      apiClient.get<CursorPage<ConversationListItem>>(
        `/api/conversations${listSearchParams({ cursor: pageParam, limit: PAGE_SIZE })}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Generated messages eligible to seed a new conversation (for the picker). */
export function useStartCandidates(enabled: boolean) {
  return useQuery({
    queryKey: conversationKeys.startCandidates,
    queryFn: () =>
      apiClient.get<StartConversationCandidate[]>(
        "/api/conversations/start-candidates",
      ),
    enabled,
  });
}

/** One conversation thread. Polls while the last turn is from the prospect
 *  (i.e. an assistant reply is still being generated). */
export function useConversation(id: string) {
  return useQuery({
    queryKey: conversationKeys.detail(id),
    queryFn: () =>
      apiClient.get<ConversationDetail>(`/api/conversations/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const messages = query.state.data?.messages;
      const last = messages?.[messages.length - 1];
      return last?.role === "prospect" ? 2000 : false;
    },
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) =>
      apiClient.post<ConversationDetail>("/api/conversations", { messageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.all });
      queryClient.invalidateQueries({
        queryKey: conversationKeys.startCandidates,
      });
    },
  });
}

/**
 * Append a prospect reply. The pasted message is shown immediately via an
 * optimistic cache write; the server response (and subsequent polling) replaces
 * it with the persisted thread and the assistant's generated reply.
 */
export function useAddReply(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiClient.post<ConversationDetail>(
        `/api/conversations/${conversationId}/replies`,
        { content },
      ),
    onMutate: async (content: string) => {
      const key = conversationKeys.detail(conversationId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ConversationDetail>(key);
      if (previous) {
        const optimistic: ConversationMessage = {
          id: `optimistic-${Date.now()}`,
          conversationId,
          role: "prospect",
          content,
          metadata: null,
          createdAt: new Date(),
        };
        queryClient.setQueryData<ConversationDetail>(key, {
          ...previous,
          messages: [...previous.messages, optimistic],
        });
      }
      return { previous };
    },
    onError: (_error, _content, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          conversationKeys.detail(conversationId),
          context.previous,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: conversationKeys.detail(conversationId),
      });
      queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    },
  });
}
