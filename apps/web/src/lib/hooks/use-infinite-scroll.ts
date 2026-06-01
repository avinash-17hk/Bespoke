"use client";

import { useEffect, useRef, type RefObject } from "react";

interface UseInfiniteScrollOptions {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  /** Root margin so the next page loads slightly before the sentinel is hit. */
  rootMargin?: string;
  /** Scroll container to observe against. Defaults to browser viewport. */
  rootRef?: RefObject<Element | null>;
}

/**
 * Attaches an IntersectionObserver to the returned sentinel ref and calls
 * `fetchNextPage` when it scrolls into view, while a next page exists and no
 * fetch is already in flight. Returns the ref to spread onto a trailing element
 * at the bottom of the list.
 */
export function useInfiniteScroll({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  rootMargin = "240px",
  rootRef,
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin, root: rootRef?.current ?? null },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rootMargin, rootRef]);

  return sentinelRef;
}
