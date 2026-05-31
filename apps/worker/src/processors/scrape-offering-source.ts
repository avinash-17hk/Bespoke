import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { schema } from "@bespoke/db";
import { compileOfferingContext } from "@bespoke/shared";
import type { ScrapeOfferingSourcePayload } from "@bespoke/queue";
import { config } from "../config";
import { db } from "../lib/db";
import { fetchSourceMarkdown } from "../lib/firecrawl";
import { modelFor } from "../lib/ai";
import { logger } from "../lib/logger";
import { enqueueNextPendingSource } from "../lib/offering-chain";
import {
  buildCombinePrompt,
  buildInitialExtractionPrompt,
  offeringExtractionSchema,
  type ExistingOfferingFields,
  type OfferingExtraction,
} from "../prompts/offering-extraction";

/** Run one offering extraction/combine call against the schema. */
async function runExtraction(
  prompt: string,
  model: LanguageModel,
): Promise<OfferingExtraction> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: offeringExtractionSchema }),
    prompt,
    // Extraction and reconciliation are factual, not creative — keep it low.
    temperature: 0.25,
  });
  return output;
}

/** True when the offering already carries structured content to merge into. */
function hasStructuredContent(offering: ExistingOfferingFields): boolean {
  return Boolean(
    offering.description ||
      offering.targetAudience ||
      offering.problemSolved ||
      offering.uniqueValueProp ||
      offering.proofPoints,
  );
}

/**
 * Scrape one offering source URL and fold it into the offering's structured
 * fields with the LLM. Two modes:
 *  - INITIAL (offering has no structured content yet): extract a fresh offering
 *    from the page, then fill only empty fields so anything the user typed in
 *    the create form still wins.
 *  - COMBINE (offering already has content from an earlier scrape or the user):
 *    reconcile the new source into the existing offering with the combine prompt
 *    so multiple URLs produce one clean, categorized offering — not stapled
 *    blocks. The merged result is authoritative and written back directly.
 *
 * Either way the compiled context is rebuilt from the clean structured fields.
 * The Postgres scrape-job row is updated at every step.
 */
export async function scrapeOfferingSource(
  job: Job<ScrapeOfferingSourcePayload>,
): Promise<void> {
  const { sourceId, offeringId, userId } = job.data;
  const jobFilter = eq(schema.scrapeJobs.bullmqJobId, job.id ?? "");
  const log = logger.child({
    job: job.name,
    jobId: job.id,
    sourceId,
    offeringId,
  });

  await db
    .update(schema.scrapeJobs)
    .set({ status: "processing" })
    .where(jobFilter);

  try {
    const [source] = await db
      .select()
      .from(schema.offeringSources)
      .where(eq(schema.offeringSources.id, sourceId));
    if (!source?.sourceUrl) {
      throw new Error(`Offering source ${sourceId} has no URL`);
    }

    // Use the user's chosen model; fall back to server default when unset.
    const [settings] = await db
      .select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId));
    const modelSlug = settings?.generationModel || config.OPENROUTER_MODEL;
    const model = modelFor(modelSlug);

    const [offering] = await db
      .select()
      .from(schema.offerings)
      .where(eq(schema.offerings.id, offeringId));
    if (!offering) throw new Error(`Offering ${offeringId} not found`);

    log.info("scraping url", { url: source.sourceUrl });
    const markdown = await fetchSourceMarkdown(source.sourceUrl);

    // Pick the mode from the offering's current state. Content present (from an
    // earlier scrape or the user's own typing) means we reconcile; otherwise we
    // extract fresh.
    const combining = hasStructuredContent(offering);
    log.info("scrape ok, extracting", {
      chars: markdown.length,
      model: modelSlug,
      mode: combining ? "combine" : "initial",
    });

    const prompt = combining
      ? buildCombinePrompt(offering, markdown)
      : buildInitialExtractionPrompt(markdown);
    const extracted = await runExtraction(prompt, model);
    log.info("extraction ok");

    // Store the per-source extraction for audit (raw page + processed block).
    const processedContent = compileOfferingContext({ name: "", ...extracted });
    await db
      .update(schema.offeringSources)
      .set({ rawContent: markdown, processedContent })
      .where(eq(schema.offeringSources.id, sourceId));

    // INITIAL fills only empty fields (user-typed values win). COMBINE already
    // reconciled against the existing offering, so its output wins — but a null
    // from the model never erases content the offering already had.
    const merged: ExistingOfferingFields = combining
      ? {
          name: offering.name,
          description: extracted.description ?? offering.description,
          summary: extracted.summary ?? offering.summary,
          targetAudience: extracted.targetAudience ?? offering.targetAudience,
          problemSolved: extracted.problemSolved ?? offering.problemSolved,
          uniqueValueProp:
            extracted.uniqueValueProp ?? offering.uniqueValueProp,
          proofPoints: extracted.proofPoints ?? offering.proofPoints,
        }
      : {
          name: offering.name,
          description: offering.description ?? extracted.description,
          summary: offering.summary ?? extracted.summary,
          targetAudience: offering.targetAudience ?? extracted.targetAudience,
          problemSolved: offering.problemSolved ?? extracted.problemSolved,
          uniqueValueProp:
            offering.uniqueValueProp ?? extracted.uniqueValueProp,
          proofPoints: offering.proofPoints ?? extracted.proofPoints,
        };

    await db
      .update(schema.offerings)
      .set({
        description: merged.description,
        summary: merged.summary,
        targetAudience: merged.targetAudience,
        problemSolved: merged.problemSolved,
        uniqueValueProp: merged.uniqueValueProp,
        proofPoints: merged.proofPoints,
        compiledContext: compileOfferingContext(merged),
      })
      .where(eq(schema.offerings.id, offeringId));

    await db
      .update(schema.scrapeJobs)
      .set({ status: "completed", result: { extracted } })
      .where(jobFilter);

    // Kick off the next queued source (if any). Stay `scraping` while more are
    // pending so the UI keeps pulsing; flip to `ready` only when the chain ends.
    const moreWork = await enqueueNextPendingSource(offeringId);
    await db
      .update(schema.offerings)
      .set({ status: moreWork ? "scraping" : "ready" })
      .where(eq(schema.offerings.id, offeringId));
    log.info("source merged", { moreWork });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("scrape-offering-source failed", { error: message });
    await db
      .update(schema.scrapeJobs)
      .set({ status: "failed", error: message })
      .where(jobFilter);
    // One bad URL must not strand the rest of the chain — try the next source.
    const moreWork = await enqueueNextPendingSource(offeringId);
    if (!moreWork) {
      // Nothing left: don't leave the offering stuck in `scraping`. Fall back to
      // ready when it has context, otherwise draft.
      const [stalled] = await db
        .select()
        .from(schema.offerings)
        .where(eq(schema.offerings.id, offeringId));
      if (stalled?.status === "scraping") {
        await db
          .update(schema.offerings)
          .set({ status: stalled.compiledContext ? "ready" : "draft" })
          .where(eq(schema.offerings.id, offeringId));
      }
    }
    throw error;
  }
}
