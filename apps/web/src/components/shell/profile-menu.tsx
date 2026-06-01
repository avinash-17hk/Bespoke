"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { useSignOut } from "@/lib/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SettingsDialog } from "./settings-dialog";
import { ThemeToggle } from "./theme-toggle";

function initials(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/**
 * Sidebar footer: the signed-in user (avatar, name, email) as a dropdown
 * trigger (Settings, Sign out) with a dedicated sign-out icon button beside it.
 * Both sign-out paths route through a confirmation dialog before ending the
 * session and returning to the landing page.
 */
export function ProfileMenu() {
  const { data: session, isPending } = useSession();
  const signOut = useSignOut();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function handleSignOut() {
    signOut.mutate(undefined, {
      onSuccess: () => {
        setConfirmOpen(false);
        router.replace("/");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    });
  }

  if (isPending) {
    return (
      <div className="flex items-center gap-3 px-1 py-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="flex flex-1 flex-col gap-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-32" />
        </div>
      </div>
    );
  }

  const user = session?.user;
  const name = user?.name;
  const email = user?.email;

  return (
    <>
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex flex-1 items-center gap-3 overflow-hidden rounded-md px-2 py-2 text-left transition-colors outline-none hover:bg-[var(--bg-surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.image ?? undefined} alt={name ?? ""} />
              <AvatarFallback className="bg-[var(--bg-surface-elevated)] text-xs text-[var(--accent-text)]">
                {initials(name, email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                {name ?? "Account"}
              </p>
              <p className="truncate text-xs text-[var(--text-muted)]">
                {email}
              </p>
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmOpen(true)}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeToggle />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Sign out?"
        description="You will need to sign in again to access your dashboard."
        confirmLabel="Sign out"
        onConfirm={handleSignOut}
        loading={signOut.isPending}
        destructive={false}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
