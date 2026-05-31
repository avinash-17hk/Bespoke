"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Copy } from "lucide-react";
import type { ConversationMessage } from "@bespoke/db";
import { Button } from "@/components/ui/button";
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
export function MessageBubble({ message }: { message: ConversationMessage }) {
  const isMine = message.role === "assistant" || message.role === "user";
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      return;
    }

    setCopied(true);
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      resetTimerRef.current = null;
    }, 1600);
  }

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
      <div className="flex items-center gap-1.5 px-1 text-[10px] text-[var(--text-muted)]">
        <span>
          {ROLE_LABEL[message.role] ?? message.role} ·{" "}
          {timeAgo(message.createdAt)}
        </span>
        {isMine ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={copied ? "Message copied" : "Copy message"}
            title={copied ? "Copied" : "Copy message"}
            onClick={() => void copyMessage()}
            className={cn(
              "size-5 text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              copied &&
                "text-[var(--accent-text)] hover:text-[var(--accent-text)]",
            )}
          >
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}
