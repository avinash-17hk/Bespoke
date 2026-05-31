import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
} from "drizzle-orm";
import { schema, type Offering, type OfferingSource } from "@bespoke/db";
import { JOB_NAME, QUEUE_NAME, enqueueJob } from "@bespoke/queue";
import {
  compileOfferingContext,
  type CursorPage,
  type ListQuery,
  type OfferingContextFields,
} from "@bespoke/shared";
import { db } from "../context";
import { queues } from "../queue";
import { clampLimit, decodeCursor, keysetBefore, toPage } from "./_cursor";

/** Max source URLs accepted at create time — bounds background scrape work. */
export const MAX_SOURCE_URLS = 5;

export interface CreateOfferingInput extends OfferingContextFields {
  /** Optional single URL to scrape (kept for backward compatibility). */
  sourceUrl?: string;
  /** Optional URLs to scrape and combine into the offering in the background. */
  sourceUrls?: string[];
}

/** Trim, drop empties, dedupe, and cap a list of source URLs. */
function normalizeSourceUrls(input: CreateOfferingInput): string[] {
  const all = [input.sourceUrl, ...(input.sourceUrls ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of all) {
    const url = raw?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_SOURCE_URLS) break;
  }
  return out;
}

export type UpdateOfferingInput = Partial<OfferingContextFields>;

export interface OfferingWithSources extends Offering {
  sources: OfferingSource[];
}

async function recordAnalytics(
  userId: string,
  entityId: string,
): Promise<void> {
  await db.insert(schema.analyticsEvents).values({
    userId,
    eventType: "offering_created",
    entityType: "offering",
    entityId,
  });
}

/**
 * Persist one offering source + its mirror scrape-job row as `pending` with no
 * BullMQ id yet. The job is NOT enqueued here — `enqueueNextPendingSource` does
 * that one at a time so same-offering scrapes never run in parallel (the worker
 * combine step does a read-modify-write on the offering and would otherwise
 * clobber itself).
 */
async function createSourceRow(
  userId: string,
  offeringId: string,
  sourceUrl: string,
): Promise<void> {
  const [source] = await db
    .insert(schema.offeringSources)
    .values({ offeringId, sourceType: "url", sourceUrl })
    .returning();

  await db.insert(schema.scrapeJobs).values({
    userId,
    jobType: JOB_NAME.scrapeOfferingSource,
    status: "pending",
    input: { sourceId: source!.id, offeringId },
    queueName: QUEUE_NAME.scrape,
    offeringId,
  });
}

/**
 * Enqueue the next not-yet-queued source scrape for an offering, but only when
 * none is already in flight — this serializes the chain so same-offering scrapes
 * never run concurrently (the worker combine step reads then writes the offering
 * and would otherwise clobber itself). No-op when a scrape is already
 * queued/running or nothing is pending. Mirrored in the worker so each finished
 * scrape kicks off the next.
 */
export async function enqueueNextPendingSource(
  offeringId: string,
): Promise<void> {
  const offeringJobs = and(
    eq(schema.scrapeJobs.offeringId, offeringId),
    eq(schema.scrapeJobs.jobType, JOB_NAME.scrapeOfferingSource),
  );

  // In flight = actively processing, OR enqueued (pending with a BullMQ id and
  // waiting to be picked up). If anything is in flight, the chain is moving.
  const [inFlight] = await db
    .select({ id: schema.scrapeJobs.id })
    .from(schema.scrapeJobs)
    .where(
      and(
        offeringJobs,
        inArray(schema.scrapeJobs.status, ["pending", "processing"]),
        isNotNull(schema.scrapeJobs.bullmqJobId),
      ),
    )
    .limit(1);
  if (inFlight) return;

  // Oldest pending source not yet handed to BullMQ is next.
  const [next] = await db
    .select({
      jobId: schema.scrapeJobs.id,
      userId: schema.scrapeJobs.userId,
      input: schema.scrapeJobs.input,
    })
    .from(schema.scrapeJobs)
    .where(
      and(
        offeringJobs,
        eq(schema.scrapeJobs.status, "pending"),
        isNull(schema.scrapeJobs.bullmqJobId),
      ),
    )
    .orderBy(asc(schema.scrapeJobs.createdAt))
    .limit(1);
  if (!next) return;

  const payload = next.input as { sourceId: string; offeringId: string };
  const bullmqJobId = await enqueueJob(queues, JOB_NAME.scrapeOfferingSource, {
    sourceId: payload.sourceId,
    offeringId,
    userId: next.userId,
  });
  await db
    .update(schema.scrapeJobs)
    .set({ bullmqJobId })
    .where(eq(schema.scrapeJobs.id, next.jobId));
}

/**
 * Cursor-paginated, name-searchable offering list scoped to the user. Orders by
 * `createdAt DESC, id DESC` so the keyset cursor is stable across pages.
 */
export async function listOfferings(
  userId: string,
  query: ListQuery = {},
): Promise<CursorPage<Offering>> {
  const limit = clampLimit(query.limit);
  const search = query.q?.trim();
  const keyset = keysetBefore(
    schema.offerings.createdAt,
    schema.offerings.id,
    decodeCursor(query.cursor),
  );

  const rows = await db
    .select()
    .from(schema.offerings)
    .where(
      and(
        eq(schema.offerings.userId, userId),
        search ? ilike(schema.offerings.name, `%${search}%`) : undefined,
        keyset,
      ),
    )
    .orderBy(desc(schema.offerings.createdAt), desc(schema.offerings.id))
    .limit(limit + 1);

  return toPage(rows, limit);
}

export async function getOffering(
  userId: string,
  id: string,
): Promise<OfferingWithSources | null> {
  const [offering] = await db
    .select()
    .from(schema.offerings)
    .where(
      and(eq(schema.offerings.id, id), eq(schema.offerings.userId, userId)),
    );

  if (!offering) return null;

  const sources = await db
    .select()
    .from(schema.offeringSources)
    .where(eq(schema.offeringSources.offeringId, id))
    .orderBy(desc(schema.offeringSources.createdAt));

  return { ...offering, sources };
}

export async function createOffering(
  userId: string,
  input: CreateOfferingInput,
): Promise<OfferingWithSources> {
  const compiledContext = compileOfferingContext(input);
  const urls = normalizeSourceUrls(input);

  const [offering] = await db
    .insert(schema.offerings)
    .values({
      userId,
      name: input.name,
      description: input.description,
      targetAudience: input.targetAudience,
      problemSolved: input.problemSolved,
      uniqueValueProp: input.uniqueValueProp,
      proofPoints: input.proofPoints,
      compiledContext,
      // Pending scrapes keep the offering in `scraping` until the worker chain
      // finishes and flips it to `ready` (or back to draft on failure).
      status: urls.length > 0 ? "scraping" : compiledContext ? "ready" : "draft",
    })
    .returning();

  // Persist every source up front so the detail page lists them immediately,
  // then enqueue only the first — the worker chains the rest one at a time.
  for (const url of urls) {
    await createSourceRow(userId, offering!.id, url);
  }
  if (urls.length > 0) {
    await enqueueNextPendingSource(offering!.id);
  }

  await recordAnalytics(userId, offering!.id);

  const created = await getOffering(userId, offering!.id);
  // Just inserted under this user — guaranteed present.
  return created!;
}

export async function updateOffering(
  userId: string,
  id: string,
  input: UpdateOfferingInput,
): Promise<OfferingWithSources | null> {
  const existing = await getOffering(userId, id);
  if (!existing) return null;

  const merged: OfferingContextFields = {
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    targetAudience: input.targetAudience ?? existing.targetAudience,
    problemSolved: input.problemSolved ?? existing.problemSolved,
    uniqueValueProp: input.uniqueValueProp ?? existing.uniqueValueProp,
    proofPoints: input.proofPoints ?? existing.proofPoints,
  };
  const compiledContext = compileOfferingContext(merged);

  await db
    .update(schema.offerings)
    .set({
      ...merged,
      compiledContext,
      status: compiledContext ? "ready" : "draft",
    })
    .where(
      and(eq(schema.offerings.id, id), eq(schema.offerings.userId, userId)),
    );

  return getOffering(userId, id);
}

export async function deleteOffering(
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await db
    .delete(schema.offerings)
    .where(
      and(eq(schema.offerings.id, id), eq(schema.offerings.userId, userId)),
    )
    .returning({ id: schema.offerings.id });

  return deleted.length > 0;
}

/**
 * Batch-delete offerings the user owns. Foreign ids are silently ignored by the
 * `user_id` filter; returns the count of rows actually removed.
 */
export async function deleteManyOfferings(
  userId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const deleted = await db
    .delete(schema.offerings)
    .where(
      and(
        eq(schema.offerings.userId, userId),
        inArray(schema.offerings.id, ids),
      ),
    )
    .returning({ id: schema.offerings.id });
  return deleted.length;
}

/**
 * Attach a new source URL to an existing offering and kick off its scrape.
 * Returns null when the offering is not owned by the user.
 */
export async function addOfferingSource(
  userId: string,
  offeringId: string,
  sourceUrl: string,
): Promise<OfferingWithSources | null> {
  const existing = await getOffering(userId, offeringId);
  if (!existing) return null;

  await createSourceRow(userId, offeringId, sourceUrl);
  // Enqueue now only if no scrape is in flight; otherwise this queues behind the
  // active chain (the worker picks it up when the current scrape finishes).
  await enqueueNextPendingSource(offeringId);
  // Reflect the in-flight scrape so the UI pulses until the worker finishes.
  await db
    .update(schema.offerings)
    .set({ status: "scraping" })
    .where(
      and(
        eq(schema.offerings.id, offeringId),
        eq(schema.offerings.userId, userId),
      ),
    );
  return getOffering(userId, offeringId);
}
