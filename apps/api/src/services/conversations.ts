import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  schema,
  type Conversation,
  type ConversationMessage,
} from "@bespoke/db";
import { JOB_NAME, QUEUE_NAME, enqueueJob } from "@bespoke/queue";
import type {
  ConversationParticipants,
  ConversationStatus,
  MessageRole,
  StartConversationCandidate,
} from "@bespoke/shared";
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

/** Conversations for the user's prospects, newest first; optional prospect filter. */
export async function listConversations(
  userId: string,
  prospectId?: string,
): Promise<ConversationListItem[]> {
  const where = prospectId
    ? and(
        eq(schema.prospects.userId, userId),
        eq(schema.conversations.prospectId, prospectId),
      )
    : eq(schema.prospects.userId, userId);

  const rows = await db
    .select({ conversation: schema.conversations })
    .from(schema.conversations)
    .innerJoin(
      schema.prospects,
      eq(schema.conversations.prospectId, schema.prospects.id),
    )
    .where(where)
    .orderBy(desc(schema.conversations.createdAt));

  return Promise.all(
    rows.map(async ({ conversation }) => {
      const [messages, participants] = await Promise.all([
        loadThread(conversation.id),
        loadParticipants(
          conversation.prospectId,
          conversation.initialMessageId,
        ),
      ]);
      const lastMessage = messages[messages.length - 1] ?? null;
      return {
        ...conversation,
        participants,
        lastMessage: lastMessage
          ? {
              role: lastMessage.role,
              content: lastMessage.content,
              createdAt: lastMessage.createdAt,
            }
          : null,
        messageCount: messages.length,
        awaitingReply: lastMessage?.role === "prospect",
      };
    }),
  );
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
