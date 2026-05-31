"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAddReply, useConversation } from "@/lib/hooks/use-conversations";
import { StatusBadge } from "@/components/shared/status-badge";
import { ParticipantCards } from "@/components/conversations/participant-cards";
import { ChatThread } from "@/components/conversations/chat-thread";
import { ChatComposer } from "@/components/conversations/chat-composer";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConversationThreadPage() {
  const { id } = useParams<{ id: string }>();
  const conversation = useConversation(id);
  const addReply = useAddReply(id);

  const messages = conversation.data?.messages ?? [];
  const awaitingReply = messages[messages.length - 1]?.role === "prospect";

  function handleSend(content: string) {
    addReply.mutate(content, {
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard/conversations"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Conversations
        </Link>
        {conversation.data ? (
          <StatusBadge status={conversation.data.status} />
        ) : null}
      </div>

      {conversation.isLoading ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : conversation.isError ? (
        <p className="text-sm text-[var(--state-error)]" role="alert">
          {conversation.error.message}
        </p>
      ) : !conversation.data ? (
        <p className="text-sm text-[var(--text-muted)]">
          Conversation not found.
        </p>
      ) : (
        <>
          <ParticipantCards participants={conversation.data.participants} />

          <div className="flex-1 pt-2">
            <ChatThread messages={messages} awaitingReply={awaitingReply} />
          </div>

          <div className="sticky bottom-0 -mx-1 bg-gradient-to-t from-[var(--bg-base)] via-[var(--bg-base)] to-transparent px-1 pb-1 pt-4">
            <ChatComposer disabled={awaitingReply} onSend={handleSend} />
          </div>
        </>
      )}
    </div>
  );
}
