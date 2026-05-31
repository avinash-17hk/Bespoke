import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { generateText } from "ai";
import { schema } from "@bespoke/db";
import type { GenerateMessagePayload } from "@bespoke/queue";
import { db } from "../lib/db";
import { resolveModelForUser } from "../lib/resolve-model";
import { logger } from "../lib/logger";
import { buildMessageSystemPrompt } from "../prompts/system-prompts";
import { cleanGeneratedText } from "../lib/text";

/** Compose the user-message context block from offering + prospect context. */
function buildPrompt(offeringContext: string, prospectContext: string): string {
  return [
    "# Your offering",
    offeringContext,
    "",
    "# The prospect",
    prospectContext,
    "",
    "Write a single personalized outreach message to this prospect about the",
    "offering above. Open with one specific hook from the prospect's",
    "## Recent Activity or ## Talking Points section — reference something only",
    "true of this person, never a generic compliment. Then connect the offering",
    "to that hook. Output only the message body — no preamble, no subject line.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Generate one outreach message: load the offering, prompt, and prospect
 * context by the IDs on the generation, wrap the prompt's saved customization
 * instructions in the base layer, call the model recorded on the generation,
 * and persist the message plus token/latency metadata. The Postgres
 * generation-job and ai_generation rows track status.
 */
export async function generateMessage(
  job: Job<GenerateMessagePayload>,
): Promise<void> {
  const { generationId, userId } = job.data;
  const jobFilter = eq(schema.generationJobs.bullmqJobId, job.id ?? "");
  const log = logger.child({ job: job.name, jobId: job.id, generationId });

  await db
    .update(schema.generationJobs)
    .set({ status: "processing" })
    .where(jobFilter);
  await db
    .update(schema.aiGenerations)
    .set({ status: "processing" })
    .where(eq(schema.aiGenerations.id, generationId));

  try {
    const [generation] = await db
      .select()
      .from(schema.aiGenerations)
      .where(eq(schema.aiGenerations.id, generationId));
    if (!generation) throw new Error(`Generation ${generationId} not found`);

    const [offering] = generation.offeringId
      ? await db
          .select()
          .from(schema.offerings)
          .where(eq(schema.offerings.id, generation.offeringId))
      : [];
    const [prompt] = generation.promptId
      ? await db
          .select()
          .from(schema.prompts)
          .where(eq(schema.prompts.id, generation.promptId))
      : [];
    const [context] = generation.prospectId
      ? await db
          .select()
          .from(schema.prospectContext)
          .where(eq(schema.prospectContext.prospectId, generation.prospectId))
      : [];

    if (!offering || !prompt || !context?.mergedContext) {
      throw new Error("Missing offering, prompt, or prospect context");
    }

    const userPrompt = buildPrompt(
      offering.compiledContext ?? "",
      context.mergedContext,
    );

    const { model, slug: modelSlug, usingUserKey } =
      await resolveModelForUser(userId, generation.model);
    log.info("generating message", { model: modelSlug, userKey: usingUserKey });
    const startedAt = Date.now();
    const { text, usage } = await generateText({
      model,
      system: buildMessageSystemPrompt(prompt.systemPrompt),
      prompt: userPrompt,
      // Outreach copy needs natural variation; too low reads formulaic.
      temperature: 0.8,
    });
    const latencyMs = Date.now() - startedAt;
    log.info("message generated", {
      latencyMs,
      tokensInput: usage?.inputTokens ?? null,
      tokensOutput: usage?.outputTokens ?? null,
    });

    await db.insert(schema.generatedMessages).values({
      generationId,
      content: cleanGeneratedText(text),
    });

    await db
      .update(schema.aiGenerations)
      .set({
        status: "completed",
        tokensInput: usage?.inputTokens ?? null,
        tokensOutput: usage?.outputTokens ?? null,
        latencyMs,
      })
      .where(eq(schema.aiGenerations.id, generationId));

    await db
      .update(schema.generationJobs)
      .set({ status: "completed" })
      .where(jobFilter);

    await db.insert(schema.analyticsEvents).values({
      userId,
      eventType: "message_generated",
      entityType: "message",
      entityId: generationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("generate-message failed", { error: message });
    await db
      .update(schema.aiGenerations)
      .set({ status: "failed" })
      .where(eq(schema.aiGenerations.id, generationId));
    await db
      .update(schema.generationJobs)
      .set({ status: "failed", error: message })
      .where(jobFilter);
    throw error;
  }
}
