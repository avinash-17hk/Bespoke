import { and, desc, eq, ilike, inArray, isNotNull, or } from "drizzle-orm";
import {
  schema,
  type Prospect,
  type ProspectAsset,
} from "@bespoke/db";
import { JOB_NAME, QUEUE_NAME, enqueueJob } from "@bespoke/queue";
import type {
  CursorPage,
  ListQuery,
  ProspectAssetType,
} from "@bespoke/shared";
import { db } from "../context";
import { queues } from "../queue";
import { clampLimit, decodeCursor, keysetBefore, toPage } from "./_cursor";

export interface ProspectAssetInput {
  assetType: ProspectAssetType;
  url?: string;
  fileKey?: string;
}

export interface CreateProspectInput {
  name: string;
  email?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  notes?: string | null;
  assets?: ProspectAssetInput[];
}

export type UpdateProspectInput = Partial<Omit<CreateProspectInput, "assets">>;

export interface ProspectWithDetails extends Prospect {
  assets: ProspectAsset[];
  /** True while any asset is still being scraped or before context is built. */
  scraping: boolean;
}

/** List row carrying the derived enrichment state for the pulsing card. */
export interface ProspectListItem extends Prospect {
  scraping: boolean;
}

/**
 * A prospect is "scraping" while it has assets and either one is still
 * pending/processing or its consolidated context has not been built yet. A
 * prospect with no assets is never scraping. Mirrors the offering's `scraping`
 * status, but derived (prospects have no status column).
 */
function deriveScraping(
  statuses: ProspectAsset["status"][],
  hasContext: boolean,
): boolean {
  if (statuses.length === 0) return false;
  const outstanding = statuses.some(
    (s) => s === "pending" || s === "processing",
  );
  return outstanding || !hasContext;
}

/** Compute the `scraping` flag for a page of prospects in two bounded queries. */
async function scrapingFlags(
  prospectIds: string[],
): Promise<Map<string, boolean>> {
  const flags = new Map<string, boolean>();
  if (prospectIds.length === 0) return flags;

  const assets = await db
    .select({
      prospectId: schema.prospectAssets.prospectId,
      status: schema.prospectAssets.status,
    })
    .from(schema.prospectAssets)
    .where(inArray(schema.prospectAssets.prospectId, prospectIds));

  const prospectsWithCtx = await db
    .select({ id: schema.prospects.id })
    .from(schema.prospects)
    .where(and(inArray(schema.prospects.id, prospectIds), isNotNull(schema.prospects.mergedContext)));
  const hasContext = new Set(prospectsWithCtx.map((p) => p.id));

  const byProspect = new Map<string, ProspectAsset["status"][]>();
  for (const asset of assets) {
    const list = byProspect.get(asset.prospectId) ?? [];
    list.push(asset.status);
    byProspect.set(asset.prospectId, list);
  }

  for (const id of prospectIds) {
    flags.set(id, deriveScraping(byProspect.get(id) ?? [], hasContext.has(id)));
  }
  return flags;
}

async function recordAnalytics(
  userId: string,
  entityId: string,
): Promise<void> {
  await db.insert(schema.analyticsEvents).values({
    userId,
    eventType: "prospect_created",
    entityType: "prospect",
    entityId,
  });
}

/**
 * Insert one prospect asset, mirror a Postgres scrape-job row, and enqueue the
 * scrape (URL fetch or screenshot vision). The BullMQ id is written back for
 * status correlation.
 */
async function enqueueProspectAssetScrape(
  userId: string,
  prospectId: string,
  asset: ProspectAssetInput,
): Promise<ProspectAsset> {
  const [created] = await db
    .insert(schema.prospectAssets)
    .values({
      prospectId,
      assetType: asset.assetType,
      url: asset.url,
      fileKey: asset.fileKey,
      status: "pending",
    })
    .returning();

  const [job] = await db
    .insert(schema.scrapeJobs)
    .values({
      userId,
      jobType: JOB_NAME.scrapeProspectAsset,
      status: "pending",
      input: { assetId: created!.id, prospectId },
      queueName: QUEUE_NAME.scrape,
      prospectId,
    })
    .returning();

  const bullmqJobId = await enqueueJob(queues, JOB_NAME.scrapeProspectAsset, {
    assetId: created!.id,
    prospectId,
    userId,
  });

  await db
    .update(schema.scrapeJobs)
    .set({ bullmqJobId })
    .where(eq(schema.scrapeJobs.id, job!.id));

  return created!;
}

/**
 * Cursor-paginated prospect list scoped to the user. Search matches name,
 * company, or email. Ordered by `createdAt DESC, id DESC` for a stable keyset.
 */
export async function listProspects(
  userId: string,
  query: ListQuery = {},
): Promise<CursorPage<ProspectListItem>> {
  const limit = clampLimit(query.limit);
  const search = query.q?.trim();
  const keyset = keysetBefore(
    schema.prospects.createdAt,
    schema.prospects.id,
    decodeCursor(query.cursor),
  );

  const rows = await db
    .select()
    .from(schema.prospects)
    .where(
      and(
        eq(schema.prospects.userId, userId),
        search
          ? or(
              ilike(schema.prospects.name, `%${search}%`),
              ilike(schema.prospects.companyName, `%${search}%`),
              ilike(schema.prospects.email, `%${search}%`),
            )
          : undefined,
        keyset,
      ),
    )
    .orderBy(desc(schema.prospects.createdAt), desc(schema.prospects.id))
    .limit(limit + 1);

  const page = toPage(rows, limit);
  const flags = await scrapingFlags(page.items.map((p) => p.id));
  return {
    items: page.items.map((p) => ({ ...p, scraping: flags.get(p.id) ?? false })),
    nextCursor: page.nextCursor,
  };
}

export async function getProspect(
  userId: string,
  id: string,
): Promise<ProspectWithDetails | null> {
  const [prospect] = await db
    .select()
    .from(schema.prospects)
    .where(
      and(eq(schema.prospects.id, id), eq(schema.prospects.userId, userId)),
    );
  if (!prospect) return null;

  const assets = await db
    .select()
    .from(schema.prospectAssets)
    .where(eq(schema.prospectAssets.prospectId, id))
    .orderBy(desc(schema.prospectAssets.createdAt));

  const scraping = deriveScraping(
    assets.map((a) => a.status),
    Boolean(prospect.mergedContext),
  );

  return { ...prospect, assets, scraping };
}

export async function createProspect(
  userId: string,
  input: CreateProspectInput,
): Promise<ProspectWithDetails> {
  const [prospect] = await db
    .insert(schema.prospects)
    .values({
      userId,
      name: input.name,
      email: input.email,
      jobTitle: input.jobTitle,
      companyName: input.companyName,
      notes: input.notes,
    })
    .returning();

  for (const asset of input.assets ?? []) {
    await enqueueProspectAssetScrape(userId, prospect!.id, asset);
  }

  await recordAnalytics(userId, prospect!.id);

  const created = await getProspect(userId, prospect!.id);
  return created!;
}

export async function updateProspect(
  userId: string,
  id: string,
  input: UpdateProspectInput,
): Promise<ProspectWithDetails | null> {
  const existing = await getProspect(userId, id);
  if (!existing) return null;

  await db
    .update(schema.prospects)
    .set({
      name: input.name ?? existing.name,
      email: input.email ?? existing.email,
      jobTitle: input.jobTitle ?? existing.jobTitle,
      companyName: input.companyName ?? existing.companyName,
      notes: input.notes ?? existing.notes,
    })
    .where(
      and(eq(schema.prospects.id, id), eq(schema.prospects.userId, userId)),
    );

  return getProspect(userId, id);
}

export async function deleteProspect(
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await db
    .delete(schema.prospects)
    .where(
      and(eq(schema.prospects.id, id), eq(schema.prospects.userId, userId)),
    )
    .returning({ id: schema.prospects.id });
  return deleted.length > 0;
}

/**
 * Batch-delete prospects the user owns. Foreign ids are ignored by the
 * `user_id` filter; returns the count of rows actually removed.
 */
export async function deleteManyProspects(
  userId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const deleted = await db
    .delete(schema.prospects)
    .where(
      and(
        eq(schema.prospects.userId, userId),
        inArray(schema.prospects.id, ids),
      ),
    )
    .returning({ id: schema.prospects.id });
  return deleted.length;
}

/** Outcome of a retry attempt, so the route can map to the right status code. */
export type RetryAssetResult =
  | { ok: true; prospect: ProspectWithDetails }
  | { ok: false; reason: "not_found" | "not_failed" | "retry_exhausted" };

/**
 * Re-queue a single failed asset's scrape, at most once. Resets the existing
 * asset row to `pending`, increments `retryCount`, and enqueues a fresh
 * scrape job against the same asset id. Guards ownership, the `failed` status,
 * and the one-retry cap.
 */
export async function retryProspectAsset(
  userId: string,
  prospectId: string,
  assetId: string,
): Promise<RetryAssetResult> {
  const existing = await getProspect(userId, prospectId);
  if (!existing) return { ok: false, reason: "not_found" };

  const asset = existing.assets.find((a) => a.id === assetId);
  if (!asset) return { ok: false, reason: "not_found" };
  if (asset.status !== "failed") return { ok: false, reason: "not_failed" };
  if (asset.retryCount >= 1) return { ok: false, reason: "retry_exhausted" };

  await db
    .update(schema.prospectAssets)
    .set({ status: "pending", retryCount: asset.retryCount + 1 })
    .where(eq(schema.prospectAssets.id, assetId));

  const [job] = await db
    .insert(schema.scrapeJobs)
    .values({
      userId,
      jobType: JOB_NAME.scrapeProspectAsset,
      status: "pending",
      input: { assetId, prospectId },
      queueName: QUEUE_NAME.scrape,
      prospectId,
    })
    .returning();

  const bullmqJobId = await enqueueJob(queues, JOB_NAME.scrapeProspectAsset, {
    assetId,
    prospectId,
    userId,
  });

  await db
    .update(schema.scrapeJobs)
    .set({ bullmqJobId })
    .where(eq(schema.scrapeJobs.id, job!.id));

  const prospect = await getProspect(userId, prospectId);
  return { ok: true, prospect: prospect! };
}

/**
 * Attach one asset to an existing prospect and kick off its scrape. Returns
 * null when the prospect is not owned by the user.
 */
export async function addProspectAsset(
  userId: string,
  prospectId: string,
  asset: ProspectAssetInput,
): Promise<ProspectWithDetails | null> {
  const existing = await getProspect(userId, prospectId);
  if (!existing) return null;

  await enqueueProspectAssetScrape(userId, prospectId, asset);
  return getProspect(userId, prospectId);
}
