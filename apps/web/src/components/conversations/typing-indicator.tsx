"use client";

import { motion } from "motion/react";

/**
 * User-aligned "generating" affordance shown while a follow-up is being
 * produced. Three dots pulse via opacity only, so it stays calm and is safe
 * under reduced-motion (no transform animation). This replaces the old spinner
 * inside the reply input, keeping the wait where the message will appear.
 */
export function TypingIndicator() {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 rounded-lg rounded-br-sm border border-[var(--accent-primary)]/40 bg-[var(--accent-subtle)] px-4 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[var(--accent-text)]"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{
              duration: 1.1,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.16,
            }}
          />
        ))}
      </div>
      <span className="px-1 text-[10px] text-[var(--text-muted)]">
        Generating follow-up
      </span>
    </div>
  );
}
