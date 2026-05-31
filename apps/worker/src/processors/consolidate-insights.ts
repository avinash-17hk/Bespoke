import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { schema } from "@bespoke/db";
import { compileProspectContext, type StructuredData } from "@bespoke/shared";
import type { ConsolidateInsightsPayload } from "@bespoke/queue";
import { db } from "../lib/db";
import { logger } from "../lib/logger";

/**
 * Merge every `prospect_insights` row for a prospect into a single compiled
 * context block and upsert `prospect_context`. Enqueued by
 * `scrape-prospect-asset` once the prospect's last asset finishes, so message
 * generation reads one ready-made block instead of re-merging N rows.
 */
export async function consolidateInsights(
  job: Job<ConsolidateInsightsPayload>,
): Promise<void> {
  const { prospectId } = job.data;
  const log = logger.child({ job: job.name, jobId: job.id, prospectId });

  try {
    const [prospect] = await db
      .select()
      .from(schema.prospects)
      .where(eq(schema.prospects.id, prospectId));
    if (!prospect) {
      throw new Error(`Prospect ${prospectId} not found`);
    }

    const insights = await db
      .select()
      .from(schema.prospectInsights)
      .where(eq(schema.prospectInsights.prospectId, prospectId));
    log.info("consolidating insights", { insightCount: insights.length });

    // Pair each insight with its source asset type for section labelling.
    const assets = await db
      .select()
      .from(schema.prospectAssets)
      .where(eq(schema.prospectAssets.prospectId, prospectId));
    const assetTypeById = new Map(assets.map((a) => [a.id, a.assetType]));

    const mergedContext = compileProspectContext(prospect, insights.map((row) => ({
      assetType:
        (row.sourceAssetId && assetTypeById.get(row.sourceAssetId)) || "other_url",
      summary: row.summary ?? "",
      structuredData: (row.structuredData as StructuredData | null) ?? null,
    })));

    await db
      .update(schema.prospects)
      .set({ mergedContext, contextUpdatedAt: new Date() })
      .where(eq(schema.prospects.id, prospectId));
    log.info("prospect context updated");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("consolidate-insights failed", { error: message });
    throw error;
  }
}
