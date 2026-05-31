"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { Toaster } from "@/components/ui/sonner";
import { SidebarContent } from "@/components/shell/sidebar-content";
import { MobileTopBar } from "@/components/shell/mobile-top-bar";
import { SmoothScroll } from "@/components/shell/smooth-scroll";

/**
 * Signed-in product shell: a fixed left rail on desktop (collapses to a sheet on
 * mobile) plus a scrollable content column. `MotionConfig reducedMotion="user"`
 * makes every Motion animation in the dashboard honor the OS setting in one
 * place; `Toaster` is the single toast surface for the product (dark themed).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex h-screen overflow-hidden bg-[var(--bg-base)]">
        <div className="dashboard-atmosphere" aria-hidden="true" />

        <aside className="relative z-10 hidden w-60 shrink-0 border-r border-[var(--border-default)] bg-[var(--bg-base)]/60 backdrop-blur-sm md:block">
          <SidebarContent />
        </aside>

        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          <MobileTopBar />
          <SmoothScroll className="flex min-h-0 flex-1 flex-col">
            <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col p-4 sm:min-h-full sm:p-6">
              {children}
            </div>
          </SmoothScroll>
        </div>
      </div>

      <Toaster position="bottom-right" richColors />
    </MotionConfig>
  );
}
