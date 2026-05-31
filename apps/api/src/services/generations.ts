import { and, desc, eq } from "drizzle-orm";
import {
  schema,
  type AiGeneration,
  type GeneratedMessage,
} from "@bespoke/db";
import { JOB_NAME, QUEUE_NAME, enqueueJob } from "@bespoke/queue";
import { db } from "../context";
import { queues } from "../queue";
import { getSettings } from "./settings";

export interface CreateGenerationInput {
  offeringId: string;
  promptId: string;
  prospectId: string;
}

/** A generated message with its rating and parent-generation metadata. */
export interface MessageView extends GeneratedMessage {
  generationStatus: AiGeneration["status"];
  model: string;
}

/** Result of attempting to start a generation. */
export type CreateGenerationResult =
  | { status: "ok"; generation: AiGeneration }
  | { status: "not_found" }
  | { status: "no_context" };

/**
 * Validate that the offering, prompt, and prospect all belong to the user and
 * that the prospect has a built context, then create an `ai_generations` row,
 * mirror a `generation_jobs` row, and enqueue `generate-message`. The model is
 * resolved from the user's settings now so the generation records the slug it
 * was dispatched with.
 */
export async function createGeneration(
  userId: string,
  input: CreateGenerationInput,
): Promise<CreateGenerationResult> {
  const [offering] = await db
    .select({ id: schema.offerings.id })
    .from(schema.offerings)
    .where(
      and(
        eq(schema.offerings.id, input.offeringId),
        eq(schema.offerings.userId, userId),
      ),
    );
  const [prompt] = await db
    .select({ id: schema.prompts.id })
    .from(schema.prompts)
    .where(
      and(
        eq(schema.prompts.id, input.promptId),
        eq(schema.prompts.userId, userId),
      ),
    );
  const [prospect] = await db
    .select({ id: schema.prospects.id, mergedContext: schema.prospects.mergedContext })
    .from(schema.prospects)
    .where(
      and(
        eq(schema.prospects.id, input.prospectId),
        eq(schema.prospects.userId, userId),
      ),
    );
  if (!offering || !prompt || !prospect) return { status: "not_found" };
  if (!prospect.mergedContext) return { status: "no_context" };

  const { generationModel } = await getSettings(userId);

  const [generation] = await db
    .insert(schema.aiGenerations)
    .values({
      userId,
      generationType: "message",
      model: generationModel,
      status: "pending",
      offeringId: input.offeringId,
      promptId: input.promptId,
      prospectId: input.prospectId,
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

  const bullmqJobId = await enqueueJob(queues, JOB_NAME.generateMessage, {
    generationId: generation!.id,
    userId,
    prospectId: input.prospectId,
    offeringId: input.offeringId,
    promptId: input.promptId,
  });

  await db
    .update(schema.generationJobs)
    .set({ bullmqJobId })
    .where(eq(schema.generationJobs.id, jobRow!.id));

  return { status: "ok", generation: generation! };
}

/** A single generation's status plus its message (once produced) — for polling. */
export async function getGeneration(
  userId: string,
  generationId: string,
): Promise<(AiGeneration & { message: GeneratedMessage | null; failureReason: string | null }) | null> {
  const [generation] = await db
    .select()
    .from(schema.aiGenerations)
    .where(
      and(
        eq(schema.aiGenerations.id, generationId),
        eq(schema.aiGenerations.userId, userId),
      ),
    );
  if (!generation) return null;

  const [message] = await db
    .select()
    .from(schema.generatedMessages)
    .where(eq(schema.generatedMessages.generationId, generationId));

  const [jobRow] = await db
    .select({ error: schema.generationJobs.error })
    .from(schema.generationJobs)
    .where(eq(schema.generationJobs.generationId, generationId));

  return { ...generation, message: message ?? null, failureReason: jobRow?.error ?? null };
}

/** All generated messages for a prospect, newest first — the history list. */
export async function listMessages(
  userId: string,
  prospectId: string,
): Promise<MessageView[]> {
  const rows = await db
    .select({
      message: schema.generatedMessages,
      status: schema.aiGenerations.status,
      model: schema.aiGenerations.model,
    })
    .from(schema.generatedMessages)
    .innerJoin(
      schema.aiGenerations,
      eq(schema.generatedMessages.generationId, schema.aiGenerations.id),
    )
    .where(
      and(
        eq(schema.aiGenerations.userId, userId),
        eq(schema.aiGenerations.prospectId, prospectId),
      ),
    )
    .orderBy(desc(schema.generatedMessages.createdAt));

  return rows.map((row) => ({
    ...row.message,
    generationStatus: row.status,
    model: row.model,
  }));
}

/** Load a message only if it belongs to the user (via its generation). */
async function ownedMessage(
  userId: string,
  messageId: string,
): Promise<GeneratedMessage | null> {
  const [row] = await db
    .select({ message: schema.generatedMessages })
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
  return row?.message ?? null;
}

export async function rateMessage(
  userId: string,
  messageId: string,
  rating: number,
  feedback?: string,
): Promise<boolean> {
  const message = await ownedMessage(userId, messageId);
  if (!message) return false;

  await db
    .update(schema.generatedMessages)
    .set({ rating, feedback })
    .where(eq(schema.generatedMessages.id, messageId));

  await db.insert(schema.analyticsEvents).values({
    userId,
    eventType: "message_rated",
    entityType: "message",
    entityId: messageId,
  });
  return true;
}

export async function setFavorite(
  userId: string,
  messageId: string,
  isFavorite: boolean,
): Promise<boolean> {
  const message = await ownedMessage(userId, messageId);
  if (!message) return false;

  await db
    .update(schema.generatedMessages)
    .set({ isFavorite })
    .where(eq(schema.generatedMessages.id, messageId));

  if (isFavorite) {
    await db.insert(schema.analyticsEvents).values({
      userId,
      eventType: "message_favorited",
      entityType: "message",
      entityId: messageId,
    });
  }
  return true;
}

export async function incrementCopy(
  userId: string,
  messageId: string,
): Promise<boolean> {
  const message = await ownedMessage(userId, messageId);
  if (!message) return false;

  await db
    .update(schema.generatedMessages)
    .set({ copiedCount: message.copiedCount + 1 })
    .where(eq(schema.generatedMessages.id, messageId));

  await db.insert(schema.analyticsEvents).values({
    userId,
    eventType: "message_copied",
    entityType: "message",
    entityId: messageId,
  });
  return true;
}

export async function deleteMessage(
  userId: string,
  messageId: string,
): Promise<boolean> {
  const message = await ownedMessage(userId, messageId);
  if (!message) return false;

  await db
    .delete(schema.generatedMessages)
    .where(eq(schema.generatedMessages.id, messageId));
  return true;
}

/**
 * Re-run generation for an existing message using the same inputs (offering,
 * prompt, prospect). Returns null when the message is not owned.
 */
export async function regenerate(
  userId: string,
  messageId: string,
): Promise<CreateGenerationResult | null> {
  const message = await ownedMessage(userId, messageId);
  if (!message) return null;

  const [generation] = await db
    .select()
    .from(schema.aiGenerations)
    .where(eq(schema.aiGenerations.id, message.generationId));
  if (!generation?.offeringId || !generation.promptId || !generation.prospectId) {
    return null;
  }

  return createGeneration(userId, {
    offeringId: generation.offeringId,
    promptId: generation.promptId,
    prospectId: generation.prospectId,
  });
}
