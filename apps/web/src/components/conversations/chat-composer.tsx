"use client";

import {
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * ChatGPT-style composer: a single bordered field with the send control inset
 * bottom-right. Enter sends, Shift+Enter inserts a newline. No spinner lives
 * here — generation feedback is shown as a typing bubble in the thread.
 */
export function ChatComposer({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (content: string) => void;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const content = value.trim();
    if (!content || disabled) return;
    onSend(content);
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <form
      onSubmit={handleSubmit}
      className="relative rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-elevated)] p-2 transition-colors focus-within:border-[var(--border-strong)]"
    >
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={1}
        placeholder={
          disabled
            ? "Generating follow-up…"
            : "Paste the prospect's reply…"
        }
        className="max-h-40 min-h-11 resize-none border-0 bg-transparent pr-12 shadow-none focus-visible:ring-0 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send reply"
        className={cn(
          "absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-md transition-[background-color,opacity,transform] duration-150",
          canSend
            ? "bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary-hover)] active:scale-95"
            : "cursor-not-allowed bg-[var(--bg-surface-hover)] text-[var(--text-muted)]",
        )}
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </form>
  );
}
