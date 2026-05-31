"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ReactLenis } from "lenis/react";
import { useReducedMotion } from "motion/react";

interface SmoothScrollProps {
  children: ReactNode;
  className?: string;
}

const NATIVE_SCROLL_ROUTES = ["/dashboard/prospects"];

export function SmoothScroll({ children, className }: SmoothScrollProps) {
  const reducedMotion = useReducedMotion();
  const pathname = usePathname();
  const nativeScroll =
    reducedMotion ||
    NATIVE_SCROLL_ROUTES.some((r) => pathname.startsWith(r));

  if (nativeScroll) {
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
