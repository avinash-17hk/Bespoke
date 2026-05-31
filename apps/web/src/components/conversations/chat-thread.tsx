"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence } from "motion/react";
import type { ConversationMessage } from "@bespoke/db";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";

/**
 * The chat surface: a chronological column of bubbles with a typing indicator
 * appended while a follow-up is generating. Auto-scrolls to the newest turn.
 */
export function ChatThread({
  messages,
  awaitingReply,
}: {
  messages: ConversationMessage[];
  awaitingReply: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      block: "end",
      behavior: "smooth",
      inline: "nearest",
    });
  }, [messages.length, awaitingReply]);

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence initial={false}>
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </AnimatePresence>
      {awaitingReply ? <TypingIndicator /> : null}
      <div ref={bottomRef} />
    </div>
  );
}
