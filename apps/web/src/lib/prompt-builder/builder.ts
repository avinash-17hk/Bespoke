import type { BuilderField, BuilderState } from "./types";

/**
 * Structured builder fields — single source of truth for the form and prompt
 * generator. Each field's `section` controls where its chosen lines land:
 *
 *   intro     -> opening directive (one select field)
 *   guideline -> "Follow these guidelines" bullet
 *   avoid     -> "Avoid the following" bullet
 *
 * IMPORTANT: the base system prompt enforces non-negotiable rules (hook
 * quality, factuality, no em dashes, soft close). Builder fields must only
 * add genuinely new instructions — never restate the base rules.
 */
export const BUILDER_FIELDS: BuilderField[] = [
  {
    id: "goal",
    label: "Goal / message type",
    hint: "What this message is meant to do.",
    type: "select",
    section: "intro",
    defaultValue: "sales",
    options: [
      {
        value: "sales",
        label: "Sales outreach",
        line: "a cold outreach message that opens with a concrete prospect hook, connects the offering to that hook, and earns a reply",
      },
      {
        value: "linkedin",
        label: "LinkedIn outreach",
        line: "a short LinkedIn note (under 60 words) that feels personal rather than promotional — LinkedIn rewards brevity more than email does",
      },
      {
        value: "follow_up",
        label: "Follow up message",
        line: "a follow up to a message that got no reply — shorter than the original, adds one new angle or piece of proof, and acknowledges the prospect is busy without over-apologizing",
      },
      {
        value: "partnership",
        label: "Partnership request",
        line: "a partnership message that opens with a specific reason the two sides fit and proposes shared upside, not one-sided pitch",
      },
      {
        value: "reengagement",
        label: "Customer re-engagement",
        line: "a re-engagement message that references the prior relationship naturally and gives a fresh, context-supported reason to reconnect now",
      },
      {
        value: "general",
        label: "General outreach",
        line: "an outreach message tailored to one concrete detail from the prospect's context",
      },
    ],
  },
  {
    id: "tone",
    label: "Tone",
    type: "select",
    section: "guideline",
    defaultValue: "friendly",
    options: [
      {
        value: "friendly",
        label: "Friendly",
        line: "Sound like someone the prospect would enjoy hearing from — approachable but not overly familiar.",
      },
      {
        value: "professional",
        label: "Professional",
        line: "Stay credible and measured. Plain language, but no contractions or casual phrasing.",
      },
      {
        value: "direct",
        label: "Direct",
        line: "Lead with the point. Cut setup sentences. One sentence per idea.",
      },
      {
        value: "warm",
        label: "Warm",
        line: "Use a genuine, human voice. Contractions welcome. A single exclamation point is acceptable if it fits naturally.",
      },
      {
        value: "confident",
        label: "Confident",
        line: "State the value plainly, without hedging. Avoid words like 'maybe', 'perhaps', 'just checking'.",
      },
      {
        value: "casual",
        label: "Casual",
        line: "Write exactly as you would text a peer. Short sentences, contractions, no formalities.",
      },
    ],
  },
  {
    id: "length",
    label: "Length",
    type: "select",
    section: "guideline",
    // NOTE: this field overrides the base prompt's default 60-90 word range.
    // The generated prompt must place this instruction AFTER BASE_CONSTRAINTS
    // so the model treats the user's choice as the active ceiling.
    defaultValue: "short",
    options: [
      {
        value: "tiny",
        label: "Very short (under 60 words)",
        line: "Keep it under 60 words — this overrides the default length. Cut everything that is not the hook, the point, or the close.",
      },
      {
        value: "short",
        label: "Short (under 90 words)",
        line: "Keep it under 90 words. One hook, one point, one close.",
      },
      {
        value: "medium",
        label: "Medium (under 150 words)",
        line: "Up to 150 words is acceptable here — use the extra room for one additional piece of context or proof, not filler.",
      },
    ],
  },
  {
    id: "personalization",
    label: "Personalization",
    hint: "Prospect details to weave in.",
    type: "multi",
    section: "guideline",
    defaultValue: ["role", "company"],
    options: [
      {
        value: "role",
        label: "Their role",
        line: "Use the prospect's role as context for relevance, not as a generic opener.",
      },
      {
        value: "company",
        label: "Their company",
        line: "Use the prospect's company context to make the offering relevant to their specific situation.",
      },
      {
        value: "recent",
        label: "Recent activity",
        line: "Prefer a recent work item, post, launch, or talking point as the opening hook when one is available and specific.",
      },
      {
        value: "shared",
        label: "Shared connection",
        line: "Mention a shared interest or connection only if it is explicitly present in the prospect's context block.",
      },
      {
        value: "painpoint",
        label: "Likely pain point",
        line: "Tie the message to a likely pain point, but only when the context directly supports it — do not infer or invent.",
      },
    ],
  },
  {
    id: "cta",
    label: "Call to action",
    type: "select",
    section: "guideline",
    defaultValue: "soft",
    options: [
      {
        value: "soft",
        label: "Soft question",
        line: "Close with a soft, open question that invites a reply without any pressure.",
      },
      {
        value: "meeting",
        label: "Conversation",
        line: "Close by gently suggesting a short conversation — frame it as optional and easy to decline.",
      },
      {
        value: "reply",
        label: "Easy yes or no",
        line: "Close with a yes or no question to make replying as easy as possible.",
      },
      {
        value: "resource",
        label: "Offer a resource",
        line: "Close by offering something useful — a link, example, or short write-up — with no strings attached.",
      },
      {
        value: "none",
        label: "No explicit CTA",
        line: "Do not force a call to action. Let the message end naturally.",
      },
    ],
  },
  {
    id: "avoid",
    label: "Things to avoid",
    type: "multi",
    section: "avoid",
    defaultValue: ["buzzwords", "salesy", "templates"],
    options: [
      {
        value: "buzzwords",
        label: "Buzzwords",
        line: "corporate buzzwords and jargon",
      },
      {
        value: "salesy",
        label: "Salesy tone",
        line: "a salesy or pushy tone",
      },
      {
        value: "long",
        label: "Long paragraphs",
        line: "long paragraphs and walls of text — use short sentences instead",
      },
      {
        value: "flattery",
        label: "Generic flattery",
        line: "generic flattery and empty compliments",
      },
      {
        value: "templates",
        label: "Template feel",
        line: "anything that reads like a mass template — if swapping the name still works, rewrite it",
      },
    ],
  },
];

/** Fresh form state seeded from each field's default selection. */
export function defaultBuilderState(): BuilderState {
  const state: BuilderState = {};
  for (const field of BUILDER_FIELDS) {
    state[field.id] = Array.isArray(field.defaultValue)
      ? [...field.defaultValue]
      : field.defaultValue;
  }
  return state;
}

function selectedLine(
  field: BuilderField,
  state: BuilderState,
): string | undefined {
  const value = state[field.id];
  if (typeof value !== "string") return undefined;
  return field.options.find((o) => o.value === value)?.line;
}

function selectedLines(field: BuilderField, state: BuilderState): string[] {
  const value = state[field.id];
  const values = Array.isArray(value) ? value : [];
  return field.options
    .filter((o) => values.includes(o.value))
    .map((o) => o.line);
}

/**
 * Composes a user customization prompt from the builder selections.
 *
 * This output is passed as `userSystemPrompt` to `buildMessageSystemPrompt`,
 * which wraps it in the base layer. Do NOT restate base rules here — only
 * add genuinely new instructions that the base layer does not cover.
 */
export function buildPromptFromConfig(state: BuilderState): string {
  const introField = BUILDER_FIELDS.find((f) => f.section === "intro");
  const goalLine =
    (introField && selectedLine(introField, state)) ??
    introField?.options[0]?.line ??
    "an outreach message tailored to the prospect";

  const parts: string[] = [
    `You write outreach on behalf of the user. Draft ${goalLine}.`,
  ];

  const guidelineBullets: string[] = [];
  for (const field of BUILDER_FIELDS.filter((f) => f.section === "guideline")) {
    if (field.type === "select") {
      const line = selectedLine(field, state);
      if (line) guidelineBullets.push(line);
    } else {
      guidelineBullets.push(...selectedLines(field, state));
    }
  }
  if (guidelineBullets.length > 0) {
    parts.push(
      "",
      "Follow these guidelines:",
      ...guidelineBullets.map((b) => `- ${b}`),
    );
  }

  const avoidItems: string[] = [];
  for (const field of BUILDER_FIELDS.filter((f) => f.section === "avoid")) {
    avoidItems.push(...selectedLines(field, state));
  }
  if (avoidItems.length > 0) {
    parts.push("", "Avoid the following:", ...avoidItems.map((a) => `- ${a}`));
  }

  return parts.join("\n");
}

/** Sensible default prompt name derived from the chosen goal. */
export function suggestedNameFromState(state: BuilderState): string {
  const introField = BUILDER_FIELDS.find((f) => f.section === "intro");
  const value = introField ? state[introField.id] : undefined;
  const label =
    introField && typeof value === "string"
      ? introField.options.find((o) => o.value === value)?.label
      : undefined;
  return label ? `${label} draft` : "Outreach draft";
}
