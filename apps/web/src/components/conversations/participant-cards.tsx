"use client";

import type { ReactNode } from "react";
import { Building2, ChevronDown, Package, ScrollText, User } from "lucide-react";
import type { ConversationParticipants } from "@bespoke/shared";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

/**
 * The three inputs behind a conversation (prospect, offering, prompt) shown as a
 * compact row at the top of the thread. Each card reveals the full record in a
 * hover dropdown so the chrome stays minimal while the detail is one hover away.
 */
export function ParticipantCards({
  participants,
}: {
  participants: ConversationParticipants;
}) {
  const { prospect, offering, prompt } = participants;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <ParticipantCard
        icon={<User className="h-3.5 w-3.5" />}
        label="Prospect"
        title={prospect?.name ?? null}
        subtitle={
          prospect
            ? [prospect.jobTitle, prospect.companyName]
                .filter(Boolean)
                .join(" · ") || null
            : null
        }
        empty="No prospect linked"
        details={
          prospect ? (
            <div className="flex flex-col gap-3">
              <DetailHead title={prospect.name} sub={prospect.email} />
              <DetailRow label="Title" value={prospect.jobTitle} />
              <DetailRow label="Company" value={prospect.companyName} />
              <DetailRow label="Notes" value={prospect.notes} multiline />
            </div>
          ) : null
        }
      />

      <ParticipantCard
        icon={<Package className="h-3.5 w-3.5" />}
        label="Offering"
        title={offering?.name ?? null}
        subtitle={offering?.summary ?? offering?.description ?? null}
        empty="No offering linked"
        details={
          offering ? (
            <div className="flex flex-col gap-3">
              <DetailHead title={offering.name} sub={offering.summary} />
              <DetailRow
                label="Description"
                value={offering.description}
                multiline
              />
              <DetailRow label="Audience" value={offering.targetAudience} />
              <DetailRow
                label="Problem solved"
                value={offering.problemSolved}
                multiline
              />
              <DetailRow
                label="Value prop"
                value={offering.uniqueValueProp}
                multiline
              />
            </div>
          ) : null
        }
      />

      <ParticipantCard
        icon={<ScrollText className="h-3.5 w-3.5" />}
        label="Prompt"
        title={prompt?.name ?? null}
        subtitle={prompt?.isDefault ? "Default prompt" : null}
        empty="No prompt linked"
        details={
          prompt ? (
            <div className="flex flex-col gap-3">
              <DetailHead
                title={prompt.name}
                sub={prompt.isDefault ? "Default prompt" : null}
              />
              <DetailRow
                label="System prompt"
                value={prompt.systemPrompt}
                multiline
              />
            </div>
          ) : null
        }
      />
    </div>
  );
}

function ParticipantCard({
  icon,
  label,
  title,
  subtitle,
  empty,
  details,
}: {
  icon: ReactNode;
  label: string;
  title: string | null;
  subtitle: string | null;
  empty: string;
  details: ReactNode;
}) {
  const card = (
    <div className="group flex h-full flex-col gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]">
      <div className="flex items-center gap-1.5 text-[var(--accent-text)]">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
          {label}
        </span>
        {details ? (
          <ChevronDown className="ml-auto h-3 w-3 text-[var(--text-muted)] transition-transform duration-200 group-hover:translate-y-0.5" />
        ) : null}
      </div>
      {title ? (
        <>
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {title}
          </p>
          {subtitle ? (
            <p className="truncate text-xs text-[var(--text-muted)]">
              {subtitle}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">{empty}</p>
      )}
    </div>
  );

  if (!details) return card;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{card}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="max-h-[60vh] w-80 overflow-y-auto"
      >
        {details}
      </HoverCardContent>
    </HoverCard>
  );
}

function DetailHead({
  title,
  sub,
}: {
  title: string;
  sub?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-[var(--border-default)] pb-2">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {sub ? (
        <p className="text-xs text-[var(--text-secondary)]">{sub}</p>
      ) : null}
    </div>
  );
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </span>
      <p
        className={
          multiline
            ? "whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-secondary)]"
            : "truncate text-xs text-[var(--text-secondary)]"
        }
      >
        {value}
      </p>
    </div>
  );
}
