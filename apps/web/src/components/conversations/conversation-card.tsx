import Link from "next/link";
import {
  ArrowUpRight,
  MessagesSquare,
  Package,
  ScrollText,
} from "lucide-react";
import type { ConversationListItem } from "@/lib/hooks/use-conversations";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/status-badge";

const ROLE_PREFIX: Record<string, string> = {
  assistant: "You",
  user: "You",
  prospect: "Prospect",
};

export function ConversationCard({
  conversation,
}: {
  conversation: ConversationListItem;
}) {
  const { participants, lastMessage, awaitingReply } = conversation;
  const heading =
    participants.prospect?.name ??
    conversation.title ??
    `Conversation ${conversation.id.slice(0, 8)}`;
  const company = participants.prospect?.companyName;

  return (
    <Link
      href={`/dashboard/conversations/${conversation.id}`}
      className="group flex flex-col gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {heading}
          </p>
          {company ? (
            <p className="truncate text-xs text-[var(--text-muted)]">
              {company}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={conversation.status} />
          <ArrowUpRight className="h-4 w-4 text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent-text)]" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <MetaChip
          icon={<Package className="h-3 w-3" />}
          value={participants.offering?.name ?? "No offering"}
        />
        <MetaChip
          icon={<ScrollText className="h-3 w-3" />}
          value={participants.prompt?.name ?? "No prompt"}
        />
      </div>

      <div className="rounded-md bg-[var(--bg-base)] p-3">
        {awaitingReply ? (
          <p className="text-xs font-medium text-[var(--accent-text)]">
            Awaiting your follow-up
          </p>
        ) : lastMessage ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">
              {ROLE_PREFIX[lastMessage.role] ?? lastMessage.role}:{" "}
            </span>
            {lastMessage.content}
          </p>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">No messages yet</p>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1">
          <MessagesSquare className="h-3 w-3" />
          {conversation.messageCount}
        </span>
        <span aria-hidden>·</span>
        <span>{timeAgo(lastMessage?.createdAt ?? conversation.createdAt)}</span>
      </div>
    </Link>
  );
}

function MetaChip({
  icon,
  value,
  className,
}: {
  icon: React.ReactNode;
  value: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded border border-[var(--border-default)] bg-[var(--bg-surface-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)]",
        className,
      )}
    >
      <span className="shrink-0 text-[var(--text-muted)]">{icon}</span>
      <span className="truncate">{value}</span>
    </span>
  );
}
