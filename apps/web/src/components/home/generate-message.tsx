"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Plus, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useOfferingsInfinite } from "@/lib/hooks/use-offerings";
import { usePromptsInfinite } from "@/lib/hooks/use-prompts";
import { useProspectsInfinite } from "@/lib/hooks/use-prospects";
import {
  useCopyMessage,
  useCreateGeneration,
  useGeneration,
} from "@/lib/hooks/use-generations";
import {
  EntityPicker,
  type PickerOption,
} from "@/components/shared/entity-picker";
import { CopyableMessage } from "./copyable-message";

const OUTPUT_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;
const VALUE_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;

/**
 * Home-tab message generator, framed as a composer. Three ingredient blocks
 * (prospect, offering, prompt) sit in one row joined by "+" connectors that
 * light up as each block is filled, reading as an equation that sums through
 * "=" into the generated message below. Each block opens a searchable modal
 * over its cursor-paginated list (EntityPicker). Generation runs on the worker,
 * so the output panel polls the generation until it settles (useGeneration).
 */
export function GenerateMessage() {
  const [prospect, setProspect] = useState<PickerOption | null>(null);
  const [offering, setOffering] = useState<PickerOption | null>(null);
  const [prompt, setPrompt] = useState<PickerOption | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const createGeneration = useCreateGeneration(prospect?.id ?? "");
  const copyMessage = useCopyMessage(prospect?.id ?? "");
  const generation = useGeneration(activeId);

  const status = generation.data?.status;
  const message = generation.data?.message;
  const settled = status === "completed" || status === "failed";
  const waiting = createGeneration.isPending || (Boolean(activeId) && !settled);
  const ready = Boolean(prospect && offering && prompt);
  const filledCount = [prospect, offering, prompt].filter(Boolean).length;

  function generate() {
    if (!prospect || !offering || !prompt || waiting) return;
    createGeneration.mutate(
      { offeringId: offering.id, promptId: prompt.id, prospectId: prospect.id },
      {
        onSuccess: (gen) => setActiveId(gen.id),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <section className="relative overflow-hidden rounded-xl border border-(--border-strong) bg-bg-surface-elevated p-5 shadow-(--shadow-card) sm:p-6">
      {/* Accent top edge marks this as the primary surface of the page. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-(--accent-primary) to-transparent"
      />
      {/* Soft thread glow in the corner, echoing the dashboard backdrop. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-(--accent-subtle) blur-2xl"
      />

      <div className="relative flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-base font-semibold tracking-tight text-text-primary">
          Generate a message
        </h2>
        {/* Build progress: three dashes that fill as blocks are added. */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1 w-5 rounded-full transition-colors duration-200",
                  i < filledCount
                    ? "bg-(--accent-primary)"
                    : "bg-(--border-strong)",
                )}
              />
            ))}
          </div>
          <span className="font-mono text-[11px] tabular-nums text-text-muted">
            {filledCount}/3
          </span>
        </div>
      </div>
      <p className="relative mt-2 text-xs text-text-muted">
        Add a prospect, an offering, and a prompt. Together the three become a
        personalized outreach message.
      </p>

      {/* The assembly: three blocks summed across one row, lit connectors
          carrying the eye toward the result. Stacks on narrow screens. */}
      <div className="relative mt-6 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <EntityPicker
          noun="prospect"
          placeholder="Choose who you're reaching"
          selected={prospect}
          onSelect={setProspect}
          useItems={useProspectsInfinite}
          toOption={(p) => ({ id: p.id, label: p.name })}
          renderTrigger={({ open, selected }) => (
            <Block
              label="Prospect"
              placeholder="Choose who you're reaching"
              selected={selected}
              onOpen={open}
            />
          )}
        />
        <Connector symbol="plus" active={Boolean(prospect)} />

        <EntityPicker
          noun="offering"
          placeholder="What you're pitching"
          selected={offering}
          onSelect={setOffering}
          useItems={useOfferingsInfinite}
          toOption={(o) => ({ id: o.id, label: o.name })}
          toPreview={(o) =>
            o.summary ? (
              <>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  {o.name}
                </p>
                <p>{o.summary}</p>
              </>
            ) : undefined
          }
          renderTrigger={({ open, selected }) => (
            <Block
              label="Offering"
              placeholder="What you're pitching"
              selected={selected}
              onOpen={open}
            />
          )}
        />
        <Connector symbol="plus" active={Boolean(offering)} />

        <EntityPicker
          noun="prompt"
          placeholder="The voice and angle to use"
          selected={prompt}
          onSelect={setPrompt}
          useItems={usePromptsInfinite}
          toOption={(p) => ({
            id: p.id,
            label: p.isDefault ? `${p.name} (default)` : p.name,
          })}
          renderTrigger={({ open, selected }) => (
            <Block
              label="Prompt"
              placeholder="The voice and angle to use"
              selected={selected}
              onOpen={open}
            />
          )}
        />
      </div>

      {/* The equals node bridges the row of blocks into the action. */}
      <div className="relative mt-3 flex flex-col items-center gap-3">
        <Connector symbol="equals" active={ready} />

        <button
          type="button"
          onClick={generate}
          disabled={!ready || waiting}
          className={cn(
            "group/gen relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-surface-elevated)]",
            ready && !waiting
              ? "bg-(--accent-primary) text-white shadow-[0_8px_30px_-12px_(--accent-primary)] hover:bg-(--accent-primary-hover)]"
              : "cursor-not-allowed bg-bg-surface-hover text-(--text-muted)]",
          )}
        >
          {/* Sheen sweep on hover when actionable: one quiet flourish. */}
          {ready && !waiting ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover/gen:translate-x-full"
            />
          ) : null}
          {waiting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {waiting ? "Generating" : "Generate"}
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {waiting ? (
          <motion.div
            key="pending"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={OUTPUT_TRANSITION}
            className="mt-4 flex items-center gap-2 rounded-lg border border-border-default bg-bg-base p-4 text-xs text-(--text-muted)]"
          >
            <Loader2 className="h-4 w-4 animate-spin text-(--accent-text)]" />
            Crafting your message…
          </motion.div>
        ) : status === "failed" ? (
          <motion.div
            key="failed"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={OUTPUT_TRANSITION}
            className="mt-4 flex items-center gap-2 rounded-lg border border-(--state-error) bg-(--state-error-subtle) p-4 text-xs text-(--state-error)]"
            role="alert"
          >
            <TriangleAlert className="h-4 w-4" />
            Generation failed. Please try again.
          </motion.div>
        ) : message ? (
          <div className="mt-4">
            <CopyableMessage
              content={message.content}
              onCopy={() => copyMessage.mutate(message.id)}
            />
          </div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

/**
 * One ingredient block in the row. The index node flips to a check and lights
 * accent once a value is chosen; the whole card is the affordance that opens
 * the picker modal.
 */
function Block({
  label,
  placeholder,
  selected,
  onOpen,
}: {
  label: string;
  placeholder: string;
  selected: PickerOption | null;
  onOpen: () => void;
}) {
  const filled = Boolean(selected);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex h-full w-full flex-col gap-3 rounded-lg border p-3 text-left transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-surface-elevated)]",
        filled
          ? "border-(--accent-primary)/40 bg-(--accent-subtle)]"
          : "border-border-default bg-bg-base hover:border-(--border-strong) hover:bg-(--bg-surface-hover)]",
      )}
    >
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-md font-mono text-xs tabular-nums transition-colors duration-200",
          filled
            ? "bg-(--accent-primary) text-white"
            : "bg-bg-surface-hover text-text-muted ring-1 ring-inset ring-border-default group-hover:text-(--text-secondary)]",
        )}
      >
        {filled ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </span>

      <div className="min-w-0">
        <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-(--text-muted)]">
          {label}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={selected?.id ?? "empty"}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={VALUE_TRANSITION}
            className={cn(
              "mt-0.5 block truncate text-sm",
              filled
                ? "font-medium text-(--text-primary)]"
                : "text-(--text-muted)]",
            )}
          >
            {selected?.label ?? placeholder}
          </motion.span>
        </AnimatePresence>
      </div>
    </button>
  );
}

/**
 * Operator node joining the blocks. "+" sits between ingredients, "=" bridges
 * the row into the result. The node lights accent once its preceding block is
 * filled, so the row reads as an equation building toward a message.
 */
function Connector({
  symbol,
  active,
}: {
  symbol: "plus" | "equals";
  active: boolean;
}) {
  return (
    <div className="flex items-center justify-center" aria-hidden="true">
      <span
        className={cn(
          "grid place-items-center rounded-md border transition-colors duration-200",
          symbol === "equals" ? "h-6 w-6" : "h-5 w-5",
          active
            ? "border-(--accent-primary)/50 bg-(--accent-subtle) text-(--accent-text)]"
            : "border-(--border-strong) bg-bg-surface-elevated text-(--text-muted)]",
        )}
      >
        {symbol === "plus" ? (
          <Plus className="h-3 w-3" />
        ) : (
          <span className="text-xs font-semibold leading-none">=</span>
        )}
      </span>
    </div>
  );
}
