ALTER TABLE "prospects" ADD COLUMN "merged_context" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "context_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "generated_messages" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "generated_messages" ADD COLUMN "feedback" text;--> statement-breakpoint
UPDATE "prospects" p SET merged_context = pc.merged_context, context_updated_at = pc.last_updated_at FROM "prospect_context" pc WHERE pc.prospect_id = p.id;--> statement-breakpoint
UPDATE "generated_messages" gm SET rating = mr.rating, feedback = mr.feedback FROM "message_ratings" mr WHERE mr.message_id = gm.id;--> statement-breakpoint
ALTER TABLE "prospect_context" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_ratings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "prospect_context" CASCADE;--> statement-breakpoint
DROP TABLE "message_ratings" CASCADE;--> statement-breakpoint
CREATE INDEX "ai_generations_offering_id_idx" ON "ai_generations" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "scrape_jobs_prospect_id_idx" ON "scrape_jobs" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "scrape_jobs_offering_id_idx" ON "scrape_jobs" USING btree ("offering_id");
