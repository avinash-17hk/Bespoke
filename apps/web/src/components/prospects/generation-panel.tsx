"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  Heart,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useOfferingsInfinite } from "@/lib/hooks/use-offerings";
import { usePromptsInfinite } from "@/lib/hooks/use-prompts";
import {
  useCopyMessage,
  useCreateGeneration,
  useDeleteMessage,
  useFavoriteMessage,
  useMessages,
  useRateMessage,
  useRegenerateMessage,
  type MessageView,
} from "@/lib/hooks/use-generations";
import {
  useConversations,
  useCreateConversation,
} from "@/lib/hooks/use-conversations";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EntityPicker,
  type PickerOption,
} from "@/components/shared/entity-picker";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

/**
 * Message generation for a prospect: pick an offering + prompt, enqueue a
 * generation, and manage the resulting history (rate, favourite, copy,
 * regenerate, delete, start a conversation). History polls while a generation
 * is in flight (see useMessages).
 */
export function GenerationPanel({ prospectId }: { prospectId: string }) {
  const messages = useMessages(prospectId);
  const createGeneration = useCreateGeneration(prospectId);

  const [offering, setOffering] = useState<PickerOption | null>(null);
  const [prompt, setPrompt] = useState<PickerOption | null>(null);

  function generate() {
    if (!offering || !prompt) return;
    createGeneration.mutate(
      { offeringId: offering.id, promptId: prompt.id, prospectId },
      {
        onSuccess: () => toast.success("Generating message…"),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-elevated)] p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--accent-text)]" />
          <h2 className="text-sm font-medium text-[var(--text-primary)]">
            Generate a message
          </h2>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Offering</Label>
            <EntityPicker
              noun="offering"
              placeholder="Select an offering"
              selected={offering}
              onSelect={setOffering}
              useItems={useOfferingsInfinite}
              toOption={(o) => ({ id: o.id, label: o.name })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Prompt</Label>
            <EntityPicker
              noun="prompt"
              placeholder="Select a prompt"
              selected={prompt}
              onSelect={setPrompt}
              useItems={usePromptsInfinite}
              toOption={(p) => ({
                id: p.id,
                label: p.isDefault ? `${p.name} (default)` : p.name,
              })}
            />
          </div>
        </div>

        <Button
          className="mt-4"
          onClick={generate}
          disabled={createGeneration.isPending || !offering || !prompt}
        >
          {createGeneration.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
          Message history
        </h3>

        {messages.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : messages.data && messages.data.length > 0 ? (
          messages.data.map((message) => (
            <MessageItem
              key={message.id}
              prospectId={prospectId}
              message={message}
            />
          ))
        ) : (
          <p className="py-6 text-center text-xs text-[var(--text-muted)]">
            No messages yet. Generate your first one above.
          </p>
        )}
      </div>

      <ConversationsList prospectId={prospectId} />
    </div>
  );
}

function ConversationsList({ prospectId }: { prospectId: string }) {
  const conversations = useConversations(prospectId);
  if (!conversations.data?.length) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
        Conversations
      </h3>
      {conversations.data.map((c) => (
        <Link
          key={c.id}
          href={`/dashboard/conversations/${c.id}`}
          className="flex items-center justify-between rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
        >
          <span className="truncate">
            {c.title ?? `Conversation ${c.id.slice(0, 8)}`}
          </span>
          <StatusBadge status={c.status} />
        </Link>
      ))}
    </div>
  );
}

function MessageItem({
  prospectId,
  message,
}: {
  prospectId: string;
  message: MessageView;
}) {
  const router = useRouter();
  const rate = useRateMessage(prospectId);
  const favorite = useFavoriteMessage(prospectId);
  const copy = useCopyMessage(prospectId);
  const remove = useDeleteMessage(prospectId);
  const regenerate = useRegenerateMessage(prospectId);
  const createConversation = useCreateConversation();

  const [confirmDelete, setConfirmDelete] = useState(false);

  const pending =
    message.generationStatus === "pending" ||
    message.generationStatus === "processing";

  // Lock the action row while any single-message mutation is in flight.
  const busy =
    rate.isPending ||
    favorite.isPending ||
    copy.isPending ||
    remove.isPending ||
    regenerate.isPending ||
    createConversation.isPending;

  async function handleCopy() {
    await navigator.clipboard.writeText(message.content).catch(() => {});
    copy.mutate(message.id, {
      onError: (error) => toast.error(error.message),
    });
    toast.success("Copied to clipboard");
  }

  function handleRate(rating: number) {
    rate.mutate(
      { id: message.id, rating },
      {
        onSuccess: () => toast.success(`Rated ${rating} ★`),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function handleFavorite() {
    const next = !message.isFavorite;
    favorite.mutate(
      { id: message.id, isFavorite: next },
      {
        onSuccess: () =>
          toast.success(next ? "Added to favorites" : "Removed from favorites"),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function handleRegenerate() {
    regenerate.mutate(message.id, {
      onSuccess: () => toast.success("Regenerating message…"),
      onError: (error) => toast.error(error.message),
    });
  }

  function handleStartConversation() {
    createConversation.mutate(message.id, {
      onSuccess: (conversation) => {
        toast.success("Conversation started");
        router.push(`/dashboard/conversations/${conversation.id}`);
      },
      onError: (error) => toast.error(error.message),
    });
  }

  function handleDelete() {
    remove.mutate(message.id, {
      onSuccess: () => {
        toast.success("Message deleted");
        setConfirmDelete(false);
      },
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-[var(--text-muted)]">
          {message.model}
          {message.copiedCount ? ` · copied ${message.copiedCount}×` : ""}
        </span>
        <StatusBadge status={message.generationStatus} />
      </div>

      {pending ? (
        <div className="flex items-center gap-2 rounded-md bg-[var(--bg-base)] p-4 text-xs text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating…
        </div>
      ) : (
        <pre className="whitespace-pre-wrap rounded-md bg-[var(--bg-base)] p-4 font-mono text-sm leading-relaxed text-[var(--text-primary)]">
          {message.content}
        </pre>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <div className="mr-2 flex items-center">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handleRate(n)}
              disabled={pending || busy}
              aria-label={`Rate ${n}`}
              className="p-0.5 disabled:opacity-40"
            >
              <Star
                className={cn(
                  "h-4 w-4",
                  message.rating && message.rating >= n
                    ? "fill-[var(--state-favorite)] text-[var(--state-favorite)]"
                    : "text-[var(--text-muted)]",
                )}
              />
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleFavorite}
          disabled={busy}
        >
          <Heart
            className={cn(
              "h-4 w-4 transition-all",
              message.isFavorite
                ? "fill-[var(--state-favorite)] text-[var(--state-favorite)] drop-shadow-[0_0_6px_var(--state-favorite)]"
                : "",
            )}
          />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleCopy} disabled={busy}>
          {copy.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRegenerate}
          disabled={busy}
        >
          {regenerate.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending || busy}
          onClick={handleStartConversation}
        >
          {createConversation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageSquarePlus className="h-4 w-4" />
          )}
          Start conversation
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmDelete(true)}
          disabled={busy}
          className="text-[var(--text-muted)] hover:text-[var(--state-error)]"
        >
          {remove.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete message?"
        description="This permanently removes the generated message and its history. This cannot be undone."
        loading={remove.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
