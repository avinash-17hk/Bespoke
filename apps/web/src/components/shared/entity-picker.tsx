"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useInfiniteScroll } from "@/lib/hooks/use-infinite-scroll";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchInput } from "@/components/shared/search-input";
import { useCursorTooltip } from "@/components/shared/cursor-tooltip";

export interface PickerOption {
  id: string;
  label: string;
}

/** Minimal slice of an infinite-list query the picker needs to render + paginate. */
interface InfiniteList<T> {
  items: T[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

interface EntityPickerProps<T> {
  /** Singular noun for the entity, e.g. "prospect"; drives the dialog title. */
  noun: string;
  placeholder: string;
  selected: PickerOption | null;
  onSelect: (option: PickerOption) => void;
  /** A cursor-list hook; only fetches while the dialog is open (search-driven). */
  useItems: (query: string, enabled: boolean) => InfiniteList<T>;
  toOption: (item: T) => PickerOption;
  /** Optional cursor-following hover preview per row (e.g. an offering summary). */
  toPreview?: (item: T) => ReactNode;
  /**
   * Optional custom trigger. When provided, replaces the default dropdown-style
   * button. The picker only owns the modal + search; the caller owns the
   * affordance. `open()` launches the modal; `selected` reflects the choice.
   */
  renderTrigger?: (args: {
    open: () => void;
    selected: PickerOption | null;
  }) => ReactNode;
}

/** One selectable row, with an optional cursor-following hover preview. */
function PickerRow({
  label,
  active,
  preview,
  onChoose,
}: {
  label: string;
  active: boolean;
  preview: ReactNode;
  onChoose: () => void;
}) {
  const tip = useCursorTooltip(preview);
  return (
    <li>
      <button
        type="button"
        onClick={onChoose}
        onMouseMove={tip.onMouseMove}
        onMouseLeave={tip.onMouseLeave}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
          active
            ? "bg-[var(--accent-subtle)] text-[var(--accent-text)]"
            : "text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]",
        )}
      >
        <span className="truncate">{label}</span>
        {active ? <Check className="h-4 w-4 shrink-0" /> : null}
      </button>
      {tip.tooltip}
    </li>
  );
}

/**
 * A scalable replacement for a long dropdown: a trigger button that opens a modal
 * with debounced search over the entity's cursor-paginated list (infinite scroll).
 * The list only fetches while the modal is open, so the home tab does not load
 * three full lists up front.
 */
export function EntityPicker<T>({
  noun,
  placeholder,
  selected,
  onSelect,
  useItems,
  toOption,
  toPreview,
  renderTrigger,
}: EntityPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const list = useItems(debounced, open);
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  const sentinelRef = useInfiniteScroll({
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: list.fetchNextPage,
    rootRef: scrollViewportRef,
  });

  const isEmpty = !list.isLoading && list.items.length === 0;

  function choose(option: PickerOption) {
    onSelect(option);
    setOpen(false);
  }

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ open: () => setOpen(true), selected })
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          className="w-full justify-between font-normal"
        >
          <span
            className={cn(
              "truncate",
              selected
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-muted)]",
            )}
          >
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <DialogContent className="max-w-md gap-4">
          <DialogHeader>
            <DialogTitle className="capitalize">Select a {noun}</DialogTitle>
          </DialogHeader>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={`Search ${noun}s…`}
          />

          <ScrollArea className="h-72 -mx-1 px-1" viewportRef={scrollViewportRef}>
            {list.isLoading ? (
              <p className="py-8 text-center text-xs text-[var(--text-muted)]">
                Loading…
              </p>
            ) : isEmpty ? (
              <p className="py-8 text-center text-xs text-[var(--text-muted)]">
                {search ? `No ${noun}s match "${search}".` : `No ${noun}s yet.`}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {list.items.map((item) => {
                  const option = toOption(item);
                  return (
                    <PickerRow
                      key={option.id}
                      label={option.label}
                      active={option.id === selected?.id}
                      preview={toPreview?.(item)}
                      onChoose={() => choose(option)}
                    />
                  );
                })}
                <div ref={sentinelRef} aria-hidden className="h-px" />
                {list.isFetchingNextPage ? (
                  <p className="py-2 text-center text-xs text-[var(--text-muted)]">
                    Loading more…
                  </p>
                ) : null}
              </ul>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
