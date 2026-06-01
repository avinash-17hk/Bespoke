import { desc } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { ConversationStatus, MessageRole } from "@bespoke/shared";
import { prospects } from "./prospects";
import { timestamps } from "./_shared";

/**
 * A conversation thread with a prospect. `initialMessageId` points at the
 * generated message that started it — left as a plain column (no FK) to avoid
 * a circular reference with `generated_messages`; the app keeps it consistent.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "cascade" }),
    title: text("title"),
    status: text("status")
      .$type<ConversationStatus>()
      .notNull()
      .default("active"),
    initialMessageId: uuid("initial_message_id"),
    ...timestamps,
  },
  (table) => [
    index("conversations_prospect_id_idx").on(table.prospectId),
    index("conversations_prospect_id_created_at_id_idx").on(
      table.prospectId,
      desc(table.createdAt),
      desc(table.id),
    ),
  ],
);

/**
 * One turn in a thread. When `role` is "assistant", `metadata` carries the
 * `generationId` linking back to the generation record.
 */
export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").$type<MessageRole>().notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("conversation_messages_conversation_id_idx").on(table.conversationId),
  ],
);
