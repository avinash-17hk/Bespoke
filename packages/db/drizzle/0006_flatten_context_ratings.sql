-- Flatten prospect_context into prospects (1:1 → columns)
ALTER TABLE "prospects" ADD COLUMN "merged_context" text;
ALTER TABLE "prospects" ADD COLUMN "context_updated_at" timestamp;

UPDATE "prospects" p
SET merged_context    = pc.merged_context,
    context_updated_at = pc.last_updated_at
FROM "prospect_context" pc
WHERE pc.prospect_id = p.id;

DROP TABLE "prospect_context";

-- Flatten message_ratings into generated_messages (1:1 → columns)
ALTER TABLE "generated_messages" ADD COLUMN "rating" integer;
ALTER TABLE "generated_messages" ADD COLUMN "feedback" text;

UPDATE "generated_messages" gm
SET rating   = mr.rating,
    feedback = mr.feedback
FROM "message_ratings" mr
WHERE mr.message_id = gm.id;

DROP TABLE "message_ratings";

-- Add missing indexes
CREATE INDEX "ai_generations_offering_id_idx" ON "ai_generations" ("offering_id");
CREATE INDEX "scrape_jobs_prospect_id_idx" ON "scrape_jobs" ("prospect_id");
CREATE INDEX "scrape_jobs_offering_id_idx" ON "scrape_jobs" ("offering_id");
