"use client";

import { Loader2, MessagesSquare } from "lucide-react";
import { motion } from "motion/react";
import { useAllConversations } from "@/lib/hooks/use-conversations";
import { flattenPages } from "@/lib/hooks/_list-cache";
import { useInfiniteScroll } from "@/lib/hooks/use-infinite-scroll";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConversationCard } from "@/components/conversations/conversation-card";
import { StartConversationDialog } from "@/components/conversations/start-conversation-dialog";
import { Skeleton } from "@/components/ui/skeleton";

const list = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const card = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export default function ConversationsPage() {
  const conversations = useAllConversations();
  const items = flattenPages(conversations.data);

  const sentinelRef = useInfiniteScroll({
    hasNextPage: conversations.hasNextPage,
    isFetchingNextPage: conversations.isFetchingNextPage,
    fetchNextPage: conversations.fetchNextPage,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Threads"
        title="Conversations"
        subtitle="Reply threads you have started, from first touch to follow-up."
        action={<StartConversationDialog />}
      />

      {conversations.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : conversations.isError ? (
        <p className="text-sm text-[var(--state-error)]" role="alert">
          {conversations.error.message}
        </p>
      ) : items.length > 0 ? (
        <>
          <motion.div
            variants={list}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {items.map((conversation) => (
              <motion.div key={conversation.id} variants={card}>
                <ConversationCard conversation={conversation} />
              </motion.div>
            ))}
          </motion.div>

          <div ref={sentinelRef} aria-hidden="true" />

          {conversations.isFetchingNextPage ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={MessagesSquare}
          title="No conversations yet"
          description="Start a conversation from a generated message to track replies here."
          action={<StartConversationDialog />}
        />
      )}
    </div>
  );
}
