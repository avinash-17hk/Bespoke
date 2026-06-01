import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  schema,
  type Conversation,
  type ConversationMessage,
} from "@bespoke/db";
import { JOB_NAME, QUEUE_NAME, enqueueJob } from "@bespoke/queue";
import type {
  ConversationParticipants,
  ConversationStatus,
  CursorPage,
  ListQuery,
  MessageRole,
  StartConversationCandidate,
} from "@bespoke/shared";
import { clampLimit, decodeCursor, keysetBefore, toPage } from "./_cursor";
import { db } from "../context";
import { queues } from "../queue";
import { getSettings } from "./settings";

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}

/** A conversation enriched for the list view: who/what it is about + a preview. */
export interface ConversationListItem extends Conversation {
  participants: ConversationParticipants;
  lastMessage: { role: MessageRole; content: string; createdAt: Date } | null;
  messageCount: number;
  awaitingReply: boolean;
}

/** A full thread plus the prospect/offering/prompt behind it. */
export interface ConversationDetail extends ConversationWithMessages {
  participants: ConversationParticipants;
}

export type CreateConversationResult =
  | { status: "ok"; conversation: ConversationDetail }
  | { status: "not_found" };

export type AddReplyResult =
  | { status: "ok"; conversation: ConversationDetail }
  | { status: "not_found" };

/** Confirm a conversation belongs to the user (via its prospect) and load it. */
async function ownedConversation(
  userId: string,
  conversationId: string,
): Promise<Conversation | null> {
  const [row] = await db
    .select({ conversation: schema.conversations })
    .from(schema.conversations)
    .innerJoin(
      schema.prospects,
      eq(schema.conversations.prospectId, schema.prospects.id),
    )
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        eq(schema.prospects.userId, userId),
      ),
    );
  return row?.conversation ?? null;
}

async function loadThread(
  conversationId: string,
): Promise<ConversationMessage[]> {
  return db
    .select()
    .from(schema.conversationMessages)
    .where(eq(schema.conversationMessages.conversationId, conversationId))
    .orderBy(asc(schema.conversationMessages.createdAt));
}

/**
 * Resolve the prospect, offering, and prompt behind a conversation. The offering
 * and prompt are read from the generation that produced the opening message
 * (`initialMessageId`); they are null when that link is missing or the source
 * records were deleted.
 */
async function loadParticipants(
  prospectId: string,
  initialMessageId: string | null,
): Promise<ConversationParticipants> {
  const [prospect] = await db
    .select({
      id: schema.prospects.id,
      name: schema.prospects.name,
      jobTitle: schema.prospects.jobTitle,
      companyName: schema.prospects.companyName,
      email: schema.prospects.email,
      notes: schema.prospects.notes,
    })
    .from(schema.prospects)
    .where(eq(schema.prospects.id, prospectId));

  let offering: ConversationParticipants["offering"] = null;
  let prompt: ConversationParticipants["prompt"] = null;

  if (initialMessageId) {
    const [gen] = await db
      .select({
        offeringId: schema.aiGenerations.offeringId,
        promptId: schema.aiGenerations.promptId,
      })
      .from(schema.generatedMessages)
      .innerJoin(
        schema.aiGenerations,
        eq(schema.generatedMessages.generationId, schema.aiGenerations.id),
      )
      .where(eq(schema.generatedMessages.id, initialMessageId));

    if (gen?.offeringId) {
      const [o] = await db
        .select({
          id: schema.offerings.id,
          name: schema.offerings.name,
          description: schema.offerings.description,
          summary: schema.offerings.summary,
          targetAudience: schema.offerings.targetAudience,
          problemSolved: schema.offerings.problemSolved,
          uniqueValueProp: schema.offerings.uniqueValueProp,
        })
        .from(schema.offerings)
        .where(eq(schema.offerings.id, gen.offeringId));
      offering = o ?? null;
    }

    if (gen?.promptId) {
      const [p] = await db
        .select({
          id: schema.prompts.id,
          name: schema.prompts.name,
          systemPrompt: schema.prompts.systemPrompt,
          isDefault: schema.prompts.isDefault,
        })
        .from(schema.prompts)
        .where(eq(schema.prompts.id, gen.promptId));
      prompt = p ?? null;
    }
  }

  return { prospect: prospect ?? null, offering, prompt };
}

/**
 * Start a conversation from a generated message. Seeds the thread with that
 * message as the first assistant turn and links it via `initialMessageId`.
 * Returns not_found when the message is not owned by the user.
 */
export async function createFromMessage(
  userId: string,
  messageId: string,
): Promise<CreateConversationResult> {
  const [row] = await db
    .select({
      message: schema.generatedMessages,
      prospectId: schema.aiGenerations.prospectId,
      generationId: schema.aiGenerations.id,
    })
    .from(schema.generatedMessages)
    .innerJoin(
      schema.aiGenerations,
      eq(schema.generatedMessages.generationId, schema.aiGenerations.id),
    )
    .where(
      and(
        eq(schema.generatedMessages.id, messageId),
        eq(schema.aiGenerations.userId, userId),
      ),
    );
  if (!row?.prospectId) return { status: "not_found" };

  const [conversation] = await db
    .insert(schema.conversations)
    .values({
      prospectId: row.prospectId,
      initialMessageId: messageId,
      status: "active",
    })
    .returning();

  await db
    .update(schema.generatedMessages)
    .set({ conversationId: conversation!.id })
    .where(eq(schema.generatedMessages.id, messageId));

  await db.insert(schema.conversationMessages).values({
    conversationId: conversation!.id,
    role: "assistant",
    content: row.message.content,
    metadata: { generationId: row.generationId },
  });

  const [messages, participants] = await Promise.all([
    loadThread(conversation!.id),
    loadParticipants(row.prospectId, messageId),
  ]);
  return {
    status: "ok",
    conversation: { ...conversation!, messages, participants },
  };
}

/**
 * Cursor-paginated conversations for the user's prospects. Fixes the N+1 from
 * the old implementation by batch-loading last messages, counts, and
 * participants in 6 queries total regardless of page size.
 */
export async function listConversations(
  userId: string,
  query: ListQuery & { prospectId?: string } = {},
): Promise<CursorPage<ConversationListItem>> {
  const limit = clampLimit(query.limit);
  const keyset = keysetBefore(
    schema.conversations.createdAt,
    schema.conversations.id,
    decodeCursor(query.cursor),
  );
  const prospectFilter = query.prospectId
    ? eq(schema.conversations.prospectId, query.prospectId)
    : undefined;

  const rows = await db
    .select({ conversation: schema.conversations })
    .from(schema.conversations)
    .innerJoin(
      schema.prospects,
      eq(schema.conversations.prospectId, schema.prospects.id),
    )
    .where(and(eq(schema.prospects.userId, userId), prospectFilter, keyset))
    .orderBy(desc(schema.conversations.createdAt), desc(schema.conversations.id))
    .limit(limit + 1);

  const page = toPage(rows.map((r) => r.conversation), limit);
  if (page.items.length === 0) return { items: [], nextCursor: null };

  const conversationIds = page.items.map((c) => c.id);
  const prospectIds = [...new Set(page.items.map((c) => c.prospectId))];
  const initialMessageIds = page.items
    .map((c) => c.initialMessageId)
    .filter((id): id is string => id !== null);

  const [lastMessages, messageCounts, prospects] = await Promise.all([
    db
      .selectDistinctOn([schema.conversationMessages.conversationId], {
        conversationId: schema.conversationMessages.conversationId,
        role: schema.conversationMessages.role,
        content: schema.conversationMessages.content,
        createdAt: schema.conversationMessages.createdAt,
      })
      .from(schema.conversationMessages)
      .where(inArray(schema.conversationMessages.conversationId, conversationIds))
      .orderBy(
        schema.conversationMessages.conversationId,
        desc(schema.conversationMessages.createdAt),
      ),
    db
      .select({
        conversationId: schema.conversationMessages.conversationId,
        count: count(),
      })
      .from(schema.conversationMessages)
      .where(inArray(schema.conversationMessages.conversationId, conversationIds))
      .groupBy(schema.conversationMessages.conversationId),
    db
      .select({
        id: schema.prospects.id,
        name: schema.prospects.name,
        jobTitle: schema.prospects.jobTitle,
        companyName: schema.prospects.companyName,
        email: schema.prospects.email,
        notes: schema.prospects.notes,
      })
      .from(schema.prospects)
      .where(inArray(schema.prospects.id, prospectIds)),
  ]);

  const genByMessageId = new Map<
    string,
    { offeringId: string | null; promptId: string | null }
  >();
  let offeringIds: string[] = [];
  let promptIds: string[] = [];

  if (initialMessageIds.length > 0) {
    const gens = await db
      .select({
        messageId: schema.generatedMessages.id,
        offeringId: schema.aiGenerations.offeringId,
        promptId: schema.aiGenerations.promptId,
      })
      .from(schema.generatedMessages)
      .innerJoin(
        schema.aiGenerations,
        eq(schema.generatedMessages.generationId, schema.aiGenerations.id),
      )
      .where(inArray(schema.generatedMessages.id, initialMessageIds));

    for (const gen of gens) {
      genByMessageId.set(gen.messageId, {
        offeringId: gen.offeringId,
        promptId: gen.promptId,
      });
      if (gen.offeringId) offeringIds.push(gen.offeringId);
      if (gen.promptId) promptIds.push(gen.promptId);
    }
    offeringIds = [...new Set(offeringIds)];
    promptIds = [...new Set(promptIds)];
  }

  const [offerings, prompts] = await Promise.all([
    offeringIds.length > 0
      ? db
          .select({
            id: schema.offerings.id,
            name: schema.offerings.name,
            description: schema.offerings.description,
            summary: schema.offerings.summary,
            targetAudience: schema.offerings.targetAudience,
            problemSolved: schema.offerings.problemSolved,
            uniqueValueProp: schema.offerings.uniqueValueProp,
          })
          .from(schema.offerings)
          .where(inArray(schema.offerings.id, offeringIds))
      : Promise.resolve([] as {
          id: string;
          name: string;
          description: string | null;
          summary: string | null;
          targetAudience: string | null;
          problemSolved: string | null;
          uniqueValueProp: string | null;
        }[]),
    promptIds.length > 0
      ? db
          .select({
            id: schema.prompts.id,
            name: schema.prompts.name,
            systemPrompt: schema.prompts.systemPrompt,
            isDefault: schema.prompts.isDefault,
          })
          .from(schema.prompts)
          .where(inArray(schema.prompts.id, promptIds))
      : Promise.resolve([] as {
          id: string;
          name: string;
          systemPrompt: string;
          isDefault: boolean;
        }[]),
  ]);

  const lastMsgByConvId = new Map(lastMessages.map((m) => [m.conversationId, m]));
  const countByConvId = new Map(messageCounts.map((c) => [c.conversationId, c.count]));
  const prospectById = new Map(prospects.map((p) => [p.id, p]));
  const offeringById = new Map(offerings.map((o) => [o.id, o]));
  const promptById = new Map(prompts.map((p) => [p.id, p]));

  const items: ConversationListItem[] = page.items.map((conversation) => {
    const lastMsg = lastMsgByConvId.get(conversation.id) ?? null;
    const genData = conversation.initialMessageId
      ? (genByMessageId.get(conversation.initialMessageId) ?? null)
      : null;

    return {
      ...conversation,
      participants: {
        prospect: prospectById.get(conversation.prospectId) ?? null,
        offering: genData?.offeringId
          ? (offeringById.get(genData.offeringId) ?? null)
          : null,
        prompt: genData?.promptId
          ? (promptById.get(genData.promptId) ?? null)
          : null,
      },
      lastMessage: lastMsg
        ? { role: lastMsg.role, content: lastMsg.content, createdAt: lastMsg.createdAt }
        : null,
      messageCount: countByConvId.get(conversation.id) ?? 0,
      awaitingReply: lastMsg?.role === "prospect",
    };
  });

  return { items, nextCursor: page.nextCursor };
}

export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationDetail | null> {
  const conversation = await ownedConversation(userId, conversationId);
  if (!conversation) return null;
  const [messages, participants] = await Promise.all([
    loadThread(conversationId),
    loadParticipants(conversation.prospectId, conversation.initialMessageId),
  ]);
  return { ...conversation, messages, participants };
}

/**
 * Generated messages eligible to seed a new conversation: completed and not yet
 * attached to a thread, across all of the user's prospects. Ordered favourites
 * first, then newest, to match the picker layout.
 */
export async function listStartCandidates(
  userId: string,
): Promise<StartConversationCandidate[]> {
  const rows = await db
    .select({
      messageId: schema.generatedMessages.id,
      content: schema.generatedMessages.content,
      isFavorite: schema.generatedMessages.isFavorite,
      createdAt: schema.generatedMessages.createdAt,
      model: schema.aiGenerations.model,
      prospectId: schema.prospects.id,
      prospectName: schema.prospects.name,
      offeringName: schema.offerings.name,
    })
    .from(schema.generatedMessages)
    .innerJoin(
      schema.aiGenerations,
      eq(schema.generatedMessages.generationId, schema.aiGenerations.id),
    )
    .innerJoin(
      schema.prospects,
      eq(schema.aiGenerations.prospectId, schema.prospects.id),
    )
    .leftJoin(
      schema.offerings,
      eq(schema.aiGenerations.offeringId, schema.offerings.id),
    )
    .where(
      and(
        eq(schema.aiGenerations.userId, userId),
        eq(schema.aiGenerations.status, "completed"),
        isNull(schema.generatedMessages.conversationId),
      ),
    )
    .orderBy(
      desc(schema.generatedMessages.isFavorite),
      desc(schema.generatedMessages.createdAt),
    );

  return rows.map((r) => ({
    messageId: r.messageId,
    content: r.content,
    isFavorite: r.isFavorite,
    createdAt: r.createdAt.toISOString(),
    prospectId: r.prospectId,
    prospectName: r.prospectName,
    offeringName: r.offeringName ?? null,
    model: r.model,
  }));
}

/**
 * Append a prospect's pasted reply to the thread and enqueue `generate-reply`.
 * A new reply-type `ai_generations` row carries the offering/prompt/prospect
 * from the conversation's initial generation so the worker can rebuild context.
 */
export async function addReply(
  userId: string,
  conversationId: string,
  replyContent: string,
): Promise<AddReplyResult> {
  const conversation = await ownedConversation(userId, conversationId);
  if (!conversation) return { status: "not_found" };

  await db.insert(schema.conversationMessages).values({
    conversationId,
    role: "prospect",
    content: replyContent,
  });

  // Inherit the original generation's inputs (offering/prompt/prospect).
  const [initial] = conversation.initialMessageId
    ? await db
        .select({
          offeringId: schema.aiGenerations.offeringId,
          promptId: schema.aiGenerations.promptId,
          prospectId: schema.aiGenerations.prospectId,
        })
        .from(schema.generatedMessages)
        .innerJoin(
          schema.aiGenerations,
          eq(schema.generatedMessages.generationId, schema.aiGenerations.id),
        )
        .where(eq(schema.generatedMessages.id, conversation.initialMessageId))
    : [];

  const { generationModel } = await getSettings(userId);

  const [generation] = await db
    .insert(schema.aiGenerations)
    .values({
      userId,
      generationType: "reply",
      model: generationModel,
      status: "pending",
      offeringId: initial?.offeringId ?? null,
      promptId: initial?.promptId ?? null,
      prospectId: initial?.prospectId ?? conversation.prospectId,
    })
    .returning();

  const [jobRow] = await db
    .insert(schema.generationJobs)
    .values({
      generationId: generation!.id,
      status: "pending",
      queueName: QUEUE_NAME.generate,
    })
    .returning();

  const bullmqJobId = await enqueueJob(queues, JOB_NAME.generateReply, {
    generationId: generation!.id,
    conversationId,
    userId,
    replyContent,
  });

  await db
    .update(schema.generationJobs)
    .set({ bullmqJobId })
    .where(eq(schema.generationJobs.id, jobRow!.id));

  const [messages, participants] = await Promise.all([
    loadThread(conversationId),
    loadParticipants(conversation.prospectId, conversation.initialMessageId),
  ]);
  return { status: "ok", conversation: { ...conversation, messages, participants } };
}

export async function setStatus(
  userId: string,
  conversationId: string,
  status: ConversationStatus,
): Promise<boolean> {
  const conversation = await ownedConversation(userId, conversationId);
  if (!conversation) return false;
  await db
    .update(schema.conversations)
    .set({ status })
    .where(eq(schema.conversations.id, conversationId));
  return true;
}

export async function deleteConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const conversation = await ownedConversation(userId, conversationId);
  if (!conversation) return false;
  await db
    .delete(schema.conversations)
    .where(eq(schema.conversations.id, conversationId));
  return true;
}
