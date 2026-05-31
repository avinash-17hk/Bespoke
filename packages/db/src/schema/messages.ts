import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { GenerationType, JobStatus } from "@bespoke/shared";
import { user } from "./auth";
import { offerings } from "./offerings";
import { prompts } from "./prompts";
import { prospects } from "./prospects";
import { conversations } from "./conversations";

/**
 * One AI generation event — the record of model, token usage, latency, and the
 * inputs (offering/prompt/prospect) used. A generation produces one
 * `generatedMessage`.
 */
export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    generationType: text("generation_type").$type<GenerationType>().notNull(),
    model: text("model").notNull(),
    tokensInput: integer("tokens_input"),
    tokensOutput: integer("tokens_output"),
    latencyMs: integer("latency_ms"),
    status: text("status").$type<JobStatus>().notNull().default("pending"),
    offeringId: uuid("offering_id").references(() => offerings.id, {
      onDelete: "set null",
    }),
    promptId: uuid("prompt_id").references(() => prompts.id, {
      onDelete: "set null",
    }),
    prospectId: uuid("prospect_id").references(() => prospects.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_generations_user_id_idx").on(table.userId),
    index("ai_generations_prospect_id_idx").on(table.prospectId),
    index("ai_generations_offering_id_idx").on(table.offeringId),
  ],
);

/**
 * The message text produced by a generation. Carries user-facing state:
 * favourite flag and copy count.
 */
export const generatedMessages = pgTable(
  "generated_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => aiGenerations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    content: text("content").notNull(),
    isFavorite: boolean("is_favorite").notNull().default(false),
    copiedCount: integer("copied_count").notNull().default(0),
    rating: integer("rating"),
    feedback: text("feedback"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("generated_messages_generation_id_idx").on(table.generationId),
    index("generated_messages_conversation_id_idx").on(table.conversationId),
  ],
);

