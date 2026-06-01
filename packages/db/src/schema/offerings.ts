import { desc } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { OfferingSourceType, OfferingStatus } from "@bespoke/shared";
import { user } from "./auth";
import { timestamps } from "./_shared";

/**
 * An offering is the value proposition a user pitches. `compiledContext` is a
 * cached block rebuilt from the structured fields on every save and is what
 * generation actually reads.
 */
export const offerings = pgTable(
  "offerings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Short plain-language summary captured during scrape, shown on card hover. */
    summary: text("summary"),
    targetAudience: text("target_audience"),
    problemSolved: text("problem_solved"),
    uniqueValueProp: text("unique_value_prop"),
    proofPoints: text("proof_points"),
    compiledContext: text("compiled_context"),
    status: text("status").$type<OfferingStatus>().notNull().default("draft"),
    ...timestamps,
  },
  (table) => [
    index("offerings_user_id_idx").on(table.userId),
    index("offerings_user_id_created_at_id_idx").on(
      table.userId,
      desc(table.createdAt),
      desc(table.id),
    ),
  ],
);

/**
 * Raw and processed content scraped from an offering's source URL, kept
 * separate from the user-edited offering so scraping and manual edits compose.
 */
export const offeringSources = pgTable(
  "offering_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    offeringId: uuid("offering_id")
      .notNull()
      .references(() => offerings.id, { onDelete: "cascade" }),
    sourceType: text("source_type").$type<OfferingSourceType>().notNull(),
    sourceUrl: text("source_url"),
    rawContent: text("raw_content"),
    processedContent: text("processed_content"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("offering_sources_offering_id_idx").on(table.offeringId)],
);
