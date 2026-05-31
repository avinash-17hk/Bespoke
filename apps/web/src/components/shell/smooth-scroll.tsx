"use client";

import type { ReactNode } from "react";
import { ReactLenis } from "lenis/react";
import { useReducedMotion } from "motion/react";

interface SmoothScrollProps {
  children: ReactNode;
  className?: string;
}

/**
 * Lenis-driven smooth scrolling for the dashboard's main scroll container. The
 * wrapper element is the scroller, so Lenis smooths the product content (not
 * window scroll, which the fixed-shell layout does not use). Under reduced
 * motion it falls back to a plain native-scroll container — no inertia.
 */
export function SmoothScroll({ children, className }: SmoothScrollProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return (
      <main
        className={`dashboard-scroll min-h-0 overflow-y-auto ${className ?? ""}`}
      >
        {children}
      </main>
    );
  }

  return (
    <ReactLenis
      className={`dashboard-scroll min-h-0 overflow-y-auto ${className ?? ""}`}
      options={{ lerp: 0.12, smoothWheel: true, wheelMultiplier: 1 }}
    >
      {children}
    </ReactLenis>
  );
}
