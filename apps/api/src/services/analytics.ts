import { and, count, countDistinct, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { schema } from "@bespoke/db";
import { db } from "../context";

export interface OfferingUsage {
  offeringId: string;
  name: string;
  count: number;
}

export interface TopRatedMessage {
  messageId: string;
  content: string;
  rating: number;
}

export interface VolumePoint {
  date: string;
  count: number;
}

export interface DashboardData {
  totalMessages: number;
  messagesLast30Days: number;
  prospectsCount: number;
  conversationsWithReplies: number;
  offeringUsage: OfferingUsage[];
  topRatedMessages: TopRatedMessage[];
  volumeByDay: VolumePoint[];
}

/**
 * Aggregate the user's activity for the dashboard. Each metric is a scoped
 * query (always filtered by `userId`); they run in parallel. Counts come from
 * the canonical entity tables, not the analytics event log, so they stay exact.
 */
export async function getDashboard(userId: string): Promise<DashboardData> {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [
    totalMessages,
    messagesLast30Days,
    prospectsCount,
    conversationsWithReplies,
    offeringUsage,
    topRatedMessages,
    volumeByDay,
  ] = await Promise.all([
    // Total initial messages generated.
    db
      .select({ value: count() })
      .from(schema.generatedMessages)
      .innerJoin(
        schema.aiGenerations,
        eq(schema.generatedMessages.generationId, schema.aiGenerations.id),
      )
      .where(eq(schema.aiGenerations.userId, userId))
      .then((r) => r[0]?.value ?? 0),

    // Messages in the last 30 days.
    db
      .select({ value: count() })
      .from(schema.generatedMessages)
      .innerJoin(
        schema.aiGenerations,
        eq(schema.generatedMessages.generationId, schema.aiGenerations.id),
      )
      .where(
        and(
          eq(schema.aiGenerations.userId, userId),
          gte(schema.generatedMessages.createdAt, since30),
        ),
      )
      .then((r) => r[0]?.value ?? 0),

    // Prospects saved.
    db
      .select({ value: count() })
      .from(schema.prospects)
      .where(eq(schema.prospects.userId, userId))
      .then((r) => r[0]?.value ?? 0),

    // Conversations with at least one pasted prospect reply.
    db
      .select({
        value: countDistinct(schema.conversationMessages.conversationId),
      })
      .from(schema.conversationMessages)
      .innerJoin(
        schema.conversations,
        eq(schema.conversationMessages.conversationId, schema.conversations.id),
      )
      .innerJoin(
        schema.prospects,
        eq(schema.conversations.prospectId, schema.prospects.id),
      )
      .where(
        and(
          eq(schema.prospects.userId, userId),
          eq(schema.conversationMessages.role, "prospect"),
        ),
      )
      .then((r) => r[0]?.value ?? 0),

    // Offering usage breakdown — most-used first.
    db
      .select({
        offeringId: schema.aiGenerations.offeringId,
        name: schema.offerings.name,
        value: count(),
      })
      .from(schema.aiGenerations)
      .innerJoin(
        schema.offerings,
        eq(schema.aiGenerations.offeringId, schema.offerings.id),
      )
      .where(
        and(
          eq(schema.aiGenerations.userId, userId),
          isNotNull(schema.aiGenerations.offeringId),
        ),
      )
      .groupBy(schema.aiGenerations.offeringId, schema.offerings.name)
      .orderBy(desc(count()))
      .limit(10)
      .then((rows) =>
        rows.map((row) => ({
          offeringId: row.offeringId!,
          name: row.name,
          count: row.value,
        })),
      ),

    // Top-rated messages.
    db
      .select({
        messageId: schema.generatedMessages.id,
        content: schema.generatedMessages.content,
        rating: schema.generatedMessages.rating,
      })
      .from(schema.generatedMessages)
      .innerJoin(
        schema.aiGenerations,
        eq(schema.generatedMessages.generationId, schema.aiGenerations.id),
      )
      .where(and(eq(schema.aiGenerations.userId, userId), isNotNull(schema.generatedMessages.rating)))
      .orderBy(desc(schema.generatedMessages.rating))
      .limit(5)
      .then((rows) => rows as TopRatedMessage[]),

    // Generation volume per day over the last 14 days.
    db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${schema.aiGenerations.createdAt}), 'YYYY-MM-DD')`,
        value: count(),
      })
      .from(schema.aiGenerations)
      .where(
        and(
          eq(schema.aiGenerations.userId, userId),
          gte(schema.aiGenerations.createdAt, since14),
        ),
      )
      .groupBy(sql`date_trunc('day', ${schema.aiGenerations.createdAt})`)
      .orderBy(sql`date_trunc('day', ${schema.aiGenerations.createdAt})`)
      .then((rows) => rows.map((row) => ({ date: row.date, count: row.value }))),
  ]);

  return {
    totalMessages,
    messagesLast30Days,
    prospectsCount,
    conversationsWithReplies,
    offeringUsage,
    topRatedMessages,
    volumeByDay,
  };
}
