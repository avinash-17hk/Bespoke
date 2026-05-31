/**
 * Offering extraction prompts — scrape-offering-source worker.
 *
 * Two distinct jobs, two prompts:
 *  - INITIAL: a fresh source becomes a structured offering. Extract clean,
 *    concrete fields from raw page content.
 *  - COMBINE: a new source is merged into an offering that already has content
 *    (from an earlier scrape or the user's own typing). Reconcile into the same
 *    structured fields without losing or duplicating anything, so multiple URLs
 *    produce one clean offering rather than stapled-together blocks.
 *
 * Both emit the same schema, so the worker writes the result straight to the
 * offering columns and the compiled context stays categorized.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Structured offering fields. Field-level guidance lives in `.describe()` so the
 * model categorizes consistently on both the initial and combine passes. Null
 * means genuinely absent — never invent to fill a field.
 */
export const offeringExtractionSchema = z.object({
  description: z
    .string()
    .nullable()
    .describe(
      "What the offering is, in 1-3 plain sentences. Concrete and specific: " +
        "what it does for customers. Strip slogans and marketing fluff.",
    ),
  summary: z
    .string()
    .nullable()
    .describe(
      "One short plain-language sentence to recognize this offering when " +
        "skimming a list. Not a tagline.",
    ),
  targetAudience: z
    .string()
    .nullable()
    .describe(
      "Who this is sold to: roles, company types, segments, company size or " +
        "stage. Be specific (e.g. 'mid-market B2B sales teams'), not 'everyone'.",
    ),
  problemSolved: z
    .string()
    .nullable()
    .describe(
      "The specific pain or job-to-be-done this removes for the buyer. The " +
        "before state it fixes.",
    ),
  uniqueValueProp: z
    .string()
    .nullable()
    .describe(
      "What makes this different from the alternatives. The wedge, the " +
        "reason to pick it over doing nothing or a competitor.",
    ),
  proofPoints: z
    .string()
    .nullable()
    .describe(
      "Concrete trust signals only: named customers, metrics, results, " +
        "integrations, funding, awards. Keep verifiable claims from the source; " +
        "drop vague superlatives.",
    ),
});

export type OfferingExtraction = z.infer<typeof offeringExtractionSchema>;

/** Existing offering fields rendered as context for the combine pass. */
export interface ExistingOfferingFields {
  name: string;
  description?: string | null;
  summary?: string | null;
  targetAudience?: string | null;
  problemSolved?: string | null;
  uniqueValueProp?: string | null;
  proofPoints?: string | null;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

const ROLE =
  "You build clean, structured B2B sales offerings that downstream AI uses to " +
  "write personalized outreach. The better and more specific the offering, the " +
  "better every message. Be concrete and factual, never salesy or padded.";

const QUALITY_RULES = [
  "Rules:",
  "- Use null for anything not clearly supported by the source. Never invent.",
  "- Prefer concrete specifics (numbers, named customers, segments) over",
  "  generic marketing language.",
  "- Each field stays in its own lane: do not repeat the same fact across",
  "  multiple fields.",
  "- No em dashes. Use periods or commas.",
].join("\n");

/** INITIAL: raw page content -> a fresh structured offering. */
export function buildInitialExtractionPrompt(markdown: string): string {
  return [
    ROLE,
    "",
    "Extract a structured offering from the website content below.",
    "",
    QUALITY_RULES,
    "",
    "Website content:",
    markdown.slice(0, 12_000),
  ].join("\n");
}

/** Render an existing offering as labeled context for the combine pass. */
function renderExisting(existing: ExistingOfferingFields): string {
  const line = (label: string, value?: string | null): string =>
    `${label}: ${value?.trim() ? value.trim() : "(empty)"}`;
  return [
    line("Name", existing.name),
    line("Description", existing.description),
    line("Summary", existing.summary),
    line("Target audience", existing.targetAudience),
    line("Problem solved", existing.problemSolved),
    line("Unique value", existing.uniqueValueProp),
    line("Proof points", existing.proofPoints),
  ].join("\n");
}

/**
 * COMBINE: merge a new source into an existing offering. The existing offering
 * may be user-authored, so it is authoritative — preserve it and only enrich.
 * The model returns the complete merged offering, which the worker writes back.
 */
export function buildCombinePrompt(
  existing: ExistingOfferingFields,
  markdown: string,
): string {
  return [
    ROLE,
    "",
    "You are merging a NEW source into an EXISTING offering. Produce the",
    "complete merged offering as structured fields.",
    "",
    "Merge rules:",
    "- The existing offering is authoritative. Never drop or contradict its",
    "  information; keep its wording where it already says something.",
    "- Add only genuinely new, non-duplicate facts from the new source.",
    "- For proof points, union them: keep existing ones and add new distinct",
    "  ones. Do not replace.",
    "- Fill any field that is currently (empty) using the new source when it",
    "  supports it.",
    "- Reconcile overlaps into one clean statement per field. No duplication.",
    "",
    QUALITY_RULES,
    "",
    "EXISTING offering:",
    renderExisting(existing),
    "",
    "NEW source content:",
    markdown.slice(0, 12_000),
  ].join("\n");
}
