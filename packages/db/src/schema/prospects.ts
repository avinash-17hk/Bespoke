import { desc } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AssetStatus, ProspectAssetType } from "@bespoke/shared";
import { user } from "./auth";
import { timestamps } from "./_shared";

/** A saved prospect, reusable across offerings without re-entering details. */
export const prospects = pgTable(
  "prospects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    jobTitle: text("job_title"),
    companyName: text("company_name"),
    notes: text("notes"),
    mergedContext: text("merged_context"),
    contextUpdatedAt: timestamp("context_updated_at"),
    ...timestamps,
  },
  (table) => [
    index("prospects_user_id_idx").on(table.userId),
    index("prospects_user_id_created_at_id_idx").on(
      table.userId,
      desc(table.createdAt),
      desc(table.id),
    ),
  ],
);

/**
 * One input attached to a prospect (URL or uploaded screenshot). Each asset is
 * scraped/vision-read independently; `status` is surfaced to the user.
 */
export const prospectAssets = pgTable(
  "prospect_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "cascade" }),
    assetType: text("asset_type").$type<ProspectAssetType>().notNull(),
    url: text("url"),
    fileKey: text("file_key"),
    status: text("status").$type<AssetStatus>().notNull().default("pending"),
    // How many times a failed scrape has been re-queued. Capped at 1 (retry once).
    retryCount: integer("retry_count").notNull().default(0),
    ...timestamps,
  },
  (table) => [index("prospect_assets_prospect_id_idx").on(table.prospectId)],
);

/** Per-asset extracted insight. Many insights per prospect are merged into `prospects.merged_context`. */
export const prospectInsights = pgTable(
  "prospect_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "cascade" }),
    sourceAssetId: uuid("source_asset_id").references(() => prospectAssets.id, {
      onDelete: "cascade",
    }),
    summary: text("summary"),
    structuredData: jsonb("structured_data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("prospect_insights_prospect_id_idx").on(table.prospectId)],
);

