"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessagesSquare, Plus, Search, Star } from "lucide-react";
import { toast } from "sonner";
import type { StartConversationCandidate } from "@bespoke/shared";
import {
  useCreateConversation,
  useStartCandidates,
} from "@/lib/hooks/use-conversations";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Primary "Start conversation" action: opens a picker of generated messages
 * (favourites first, then newest) and seeds a thread from the chosen one.
 * Candidates are fetched lazily, only while the dialog is open.
 */
export function StartConversationDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const router = useRouter();
  const candidates = useStartCandidates(open);
  const createConversation = useCreateConversation();

  const filtered = useMemo(() => {
    const items = candidates.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) =>
      [c.prospectName, c.offeringName ?? "", c.content]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [candidates.data, query]);

  function start(messageId: string) {
    setPendingId(messageId);
    createConversation.mutate(messageId, {
      onSuccess: (conversation) => {
        setOpen(false);
        router.push(`/dashboard/conversations/${conversation.id}`);
      },
      onError: (error) => {
        toast.error(error.message);
        setPendingId(null);
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setPendingId(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Start conversation
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start a conversation</DialogTitle>
          <DialogDescription>
            Pick a generated message to open a thread. Favourites are listed
            first.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by prospect, offering, or text"
            className="pl-9"
          />
        </div>

        <div className="-mr-2 flex max-h-[55vh] flex-col gap-2 overflow-y-auto pr-2">
          {candidates.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))
          ) : candidates.isError ? (
            <p className="py-8 text-center text-sm text-[var(--state-error)]">
              {candidates.error.message}
            </p>
          ) : filtered.length > 0 ? (
            filtered.map((candidate) => (
              <CandidateRow
                key={candidate.messageId}
                candidate={candidate}
                pending={pendingId === candidate.messageId}
                disabled={createConversation.isPending}
                onSelect={() => start(candidate.messageId)}
              />
            ))
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <MessagesSquare className="h-8 w-8 text-[var(--text-muted)]" />
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {query ? "No matches" : "No messages to start from"}
              </p>
              <p className="max-w-xs text-xs text-[var(--text-muted)]">
                {query
                  ? "Try a different search."
                  : "Generate a message on a prospect, then start a conversation from it."}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRow({
  candidate,
  pending,
  disabled,
  onSelect,
}: {
  candidate: StartConversationCandidate;
  pending: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="group flex flex-col gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-left transition-colors hover:border-[var(--accent-primary)] hover:bg-[var(--bg-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="flex items-center gap-2">
        {candidate.isFavorite ? (
          <Star className="h-3.5 w-3.5 shrink-0 fill-[var(--state-favorite)] text-[var(--state-favorite)]" />
        ) : null}
        <span className="truncate text-sm font-medium text-[var(--text-primary)]">
          {candidate.prospectName}
        </span>
        {candidate.offeringName ? (
          <span className="truncate text-xs text-[var(--text-muted)]">
            · {candidate.offeringName}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 text-xs text-[var(--text-muted)]">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-text)]" />
          ) : (
            timeAgo(candidate.createdAt)
          )}
        </span>
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap rounded-md bg-[var(--bg-base)] p-2.5 font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
        {candidate.content}
      </p>
    </button>
  );
}
