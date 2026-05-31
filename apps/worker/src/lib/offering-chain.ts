import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { schema } from "@bespoke/db";
import { JOB_NAME, enqueueJob } from "@bespoke/queue";
import { db } from "./db";
import { queues } from "./queue";

/**
 * Enqueue the next not-yet-queued source scrape for an offering, but only when
 * none is already in flight. This serializes the per-offering scrape chain so
 * the combine step (which reads then writes the offering) never races itself.
 *
 * Returns true when a scrape is in flight or was just enqueued (more work to
 * come), false when nothing is left to scrape (the chain is done). The caller
 * uses this to decide whether the offering stays `scraping` or flips to `ready`.
 *
 * Call this only after the current job's scrape_jobs row has been marked
 * completed/failed, so it is no longer counted as in flight.
 */
export async function enqueueNextPendingSource(
  offeringId: string,
): Promise<boolean> {
  const offeringJobs = and(
    eq(schema.scrapeJobs.offeringId, offeringId),
    eq(schema.scrapeJobs.jobType, JOB_NAME.scrapeOfferingSource),
  );

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
  if (inFlight) return true;

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
  if (!next) return false;

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
  return true;
}
