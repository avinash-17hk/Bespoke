import type { Job } from "bullmq";
import { and, eq, notInArray } from "drizzle-orm";
import { generateText, Output, type LanguageModel } from "ai";
import { schema, type ProspectAsset } from "@bespoke/db";
import {
  JOB_NAME,
  enqueueJob,
  type ScrapeProspectAssetPayload,
} from "@bespoke/queue";
import { db } from "../lib/db";
import { fetchSourceMarkdown } from "../lib/firecrawl";
import { deliveryUrl } from "../lib/cloudinary";
import { decryptSecret } from "../lib/crypto";
import { resolveModel } from "../lib/resolve-model";
import { queues } from "../lib/queue";
import { logger } from "../lib/logger";
import {
  insightSchema,
  buildPromptForAssetType,
  buildLinkedInPrompt,
  type Insight,
} from "../prompts/prospect-extraction";

/** Extract an insight from scraped markdown using a type-specific prompt. */
async function extractFromText(
  markdown: string,
  assetType: string,
  model: LanguageModel,
): Promise<Insight> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: insightSchema }),
    prompt: buildPromptForAssetType(assetType, markdown),
    // Extraction must be factual, not creative — keep it low.
    temperature: 0.2,
  });
  return output;
}

/** Extract an insight from a LinkedIn screenshot via the model's vision input. */
async function extractFromImage(
  imageUrl: string,
  model: LanguageModel,
): Promise<Insight> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: insightSchema }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildLinkedInPrompt() },
          { type: "image", image: new URL(imageUrl) },
        ],
      },
    ],
    // Extraction must be factual, not creative — keep it low.
    temperature: 0.2,
  });
  return output;
}

/** URL-backed asset types; github goes via GitHub API, rest via Firecrawl. */
const URL_ASSET_TYPES = new Set([
  "github",
  "personal_site",
  "company_site",
  "other_url",
]);

/**
 * If every asset for the prospect has finished (done or failed), enqueue the
 * `consolidate-insights` job to rebuild `prospect_context`. Mirrors the
 * architecture's per-asset completion check.
 */
async function maybeConsolidate(
  prospectId: string,
  userId: string,
): Promise<void> {
  const outstanding = await db
    .select({ id: schema.prospectAssets.id })
    .from(schema.prospectAssets)
    .where(
      and(
        eq(schema.prospectAssets.prospectId, prospectId),
        notInArray(schema.prospectAssets.status, ["done", "failed"]),
      ),
    );
  if (outstanding.length > 0) return;

  await enqueueJob(queues, JOB_NAME.consolidateInsights, {
    prospectId,
    userId,
  });
}

/**
 * Scrape or vision-read one prospect asset, write a `prospect_insights` row,
 * and mark the asset done. URL assets go through Firecrawl; LinkedIn
 * screenshots go through the model's vision input (delivery URL rebuilt from
 * the Cloudinary `public_id`); free-text `notes` carry no scrape. When the
 * prospect's last asset finishes, `consolidate-insights` is enqueued. The
 * Postgres scrape-job row is updated at every step.
 */
export async function scrapeProspectAsset(
  job: Job<ScrapeProspectAssetPayload>,
): Promise<void> {
  const { assetId, prospectId, userId } = job.data;
  const jobFilter = eq(schema.scrapeJobs.bullmqJobId, job.id ?? "");
  const log = logger.child({
    job: job.name,
    jobId: job.id,
    assetId,
    prospectId,
  });

  await db
    .update(schema.scrapeJobs)
    .set({ status: "processing" })
    .where(jobFilter);
  await db
    .update(schema.prospectAssets)
    .set({ status: "processing" })
    .where(eq(schema.prospectAssets.id, assetId));

  try {
    const [asset] = await db
      .select()
      .from(schema.prospectAssets)
      .where(eq(schema.prospectAssets.id, assetId));
    if (!asset) {
      throw new Error(`Prospect asset ${assetId} not found`);
    }

    // Use the user's chosen model (vision + text); fall back to server default.
    const [settings] = await db
      .select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId));
    const userKey = settings?.openrouterApiKeyEncrypted
      ? decryptSecret(settings.openrouterApiKeyEncrypted)
      : null;
    const { model, slug: modelSlug, usingUserKey } = resolveModel(
      settings?.generationModel,
      userKey,
    );

    log.info("extracting asset", {
      assetType: asset.assetType,
      model: modelSlug,
      userKey: usingUserKey,
    });
    const insight = await extractAsset(asset, model);
    log.info("asset extracted", { hasInsight: insight !== null });

    // `notes` assets contribute no insight (free text lives on prospect.notes).
    if (insight) {
      await db.insert(schema.prospectInsights).values({
        prospectId,
        sourceAssetId: assetId,
        summary: insight.summary,
        structuredData: insight.structuredData,
      });
    }

    await db
      .update(schema.prospectAssets)
      .set({ status: "done" })
      .where(eq(schema.prospectAssets.id, assetId));
    await db
      .update(schema.scrapeJobs)
      .set({ status: "completed", result: insight ? { insight } : {} })
      .where(jobFilter);

    await maybeConsolidate(prospectId, userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("scrape-prospect-asset failed", { error: message });
    await db
      .update(schema.prospectAssets)
      .set({ status: "failed" })
      .where(eq(schema.prospectAssets.id, assetId));
    await db
      .update(schema.scrapeJobs)
      .set({ status: "failed", error: message })
      .where(jobFilter);
    // Still consolidate so one failed asset never strands the prospect.
    await maybeConsolidate(prospectId, userId);
    throw error;
  }
}

/** Run the right extraction path for the asset type. */
async function extractAsset(
  asset: ProspectAsset,
  model: LanguageModel,
): Promise<Insight | null> {
  if (asset.assetType === "linkedin_screenshot") {
    if (!asset.fileKey) {
      throw new Error(`Screenshot asset ${asset.id} has no file key`);
    }
    return extractFromImage(deliveryUrl(asset.fileKey), model);
  }

  if (URL_ASSET_TYPES.has(asset.assetType)) {
    if (!asset.url) {
      throw new Error(`URL asset ${asset.id} has no url`);
    }
    const markdown = await fetchSourceMarkdown(asset.url);
    return extractFromText(markdown, asset.assetType, model);
  }

  // notes — nothing to scrape.
  return null;
}
