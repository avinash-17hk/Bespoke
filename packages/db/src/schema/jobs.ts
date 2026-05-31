import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { JobStatus } from "@bespoke/shared";
import { user } from "./auth";
import { offerings } from "./offerings";
import { prospects } from "./prospects";
import { aiGenerations } from "./messages";
import { timestamps } from "./_shared";

/**
 * Postgres mirror of a BullMQ scrape job. `bullmqJobId` correlates this row to
 * Redis state; the error message is persisted so failures are visible without
 * inspecting Redis.
 */
export const scrapeJobs = pgTable(
  "scrape_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobType: text("job_type").notNull(),
    status: text("status").$type<JobStatus>().notNull().default("pending"),
    input: jsonb("input").$type<Record<string, unknown>>(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    bullmqJobId: text("bullmq_job_id"),
    queueName: text("queue_name"),
    prospectId: uuid("prospect_id").references(() => prospects.id, {
      onDelete: "cascade",
    }),
    offeringId: uuid("offering_id").references(() => offerings.id, {
      onDelete: "cascade",
    }),
    ...timestamps,
  },
  (table) => [
    index("scrape_jobs_user_id_idx").on(table.userId),
    index("scrape_jobs_bullmq_job_id_idx").on(table.bullmqJobId),
    index("scrape_jobs_prospect_id_idx").on(table.prospectId),
    index("scrape_jobs_offering_id_idx").on(table.offeringId),
  ],
);

/** Postgres mirror of a BullMQ generation job, linked to its generation. */
export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => aiGenerations.id, { onDelete: "cascade" }),
    status: text("status").$type<JobStatus>().notNull().default("pending"),
    error: text("error"),
    bullmqJobId: text("bullmq_job_id"),
    queueName: text("queue_name"),
    ...timestamps,
  },
  (table) => [
    index("generation_jobs_generation_id_idx").on(table.generationId),
    index("generation_jobs_bullmq_job_id_idx").on(table.bullmqJobId),
  ],
);
