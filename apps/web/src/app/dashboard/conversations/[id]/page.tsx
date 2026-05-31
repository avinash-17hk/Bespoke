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
    <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
      <header className="relative z-10 shrink-0 space-y-4 bg-[var(--bg-base)] pb-4">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : conversation.data ? (
          <ParticipantCards participants={conversation.data.participants} />
        ) : null}
      </header>

      {conversation.isLoading ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
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
          <div
            data-lenis-prevent
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-0.5 pb-2"
            aria-label="Conversation messages"
          >
            <ChatThread messages={messages} awaitingReply={awaitingReply} />
          </div>

          <footer className="relative z-10 shrink-0 border-t border-[var(--border-default)] bg-[var(--bg-base)] pt-4">
            <ChatComposer disabled={awaitingReply} onSend={handleSend} />
          </footer>
        </>
      )}
    </div>
  );
}
