import { desc } from "drizzle-orm";
import { boolean, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { timestamps } from "./_shared";

/**
 * A reusable prompt customization that drives generation. One per user may be
 * the default; `systemPrompt` is wrapped by the worker's base system prompt.
 */
export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index("prompts_user_id_idx").on(table.userId),
    index("prompts_user_id_created_at_id_idx").on(
      table.userId,
      desc(table.createdAt),
      desc(table.id),
    ),
  ],
);
