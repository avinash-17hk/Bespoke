"use client";

import { motion } from "motion/react";
import type { ConversationMessage } from "@bespoke/db";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";

const ROLE_LABEL: Record<string, string> = {
  assistant: "You",
  user: "You",
  prospect: "Prospect",
};

/**
 * One chat turn. Your messages (assistant/user) sit on the right with an accent
 * tint and render in mono to echo the generated-message panel; the prospect's
 * pasted replies sit on the left in the UI sans face.
 */
export function MessageBubble({
  message,
}: {
  message: ConversationMessage;
}) {
  const isMine = message.role === "assistant" || message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex flex-col gap-1",
        isMine ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed sm:max-w-[75%]",
          isMine
            ? "rounded-br-sm border border-[var(--accent-primary)]/40 bg-[var(--accent-subtle)] font-mono text-[var(--text-primary)]"
            : "rounded-bl-sm border border-[var(--border-default)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)]",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
      <span className="px-1 text-[10px] text-[var(--text-muted)]">
        {ROLE_LABEL[message.role] ?? message.role} ·{" "}
        {timeAgo(message.createdAt)}
      </span>
    </motion.div>
  );
}
