import type { ReactNode } from "react";

/**
 * Fills the dashboard scrollport so the thread page can pin header + composer and
 * scroll only the message column (negative margins cancel the shell padding).
 */
export default function ConversationThreadLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      data-thread-shell
      className="-m-4 flex h-full min-h-0 flex-1 flex-col overflow-hidden sm:-m-6"
    >
      {children}
    </div>
  );
}
