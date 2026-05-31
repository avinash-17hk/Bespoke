/**
 * Row types inferred directly from the Drizzle schema — never hand-written.
 * `Select` is a read row; `Insert` is the shape accepted by `.insert()`.
 * These are the canonical entity types; the web app imports them type-only.
 */
import type {
  offerings,
  offeringSources,
  prompts,
  prospects,
  prospectAssets,
  prospectInsights,
  conversations,
  conversationMessages,
  aiGenerations,
  generatedMessages,
  scrapeJobs,
  generationJobs,
  analyticsEvents,
  userSettings,
} from "./schema/index";

export type Offering = typeof offerings.$inferSelect;
export type NewOffering = typeof offerings.$inferInsert;

export type OfferingSource = typeof offeringSources.$inferSelect;
export type NewOfferingSource = typeof offeringSources.$inferInsert;

export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;

export type Prospect = typeof prospects.$inferSelect;
export type NewProspect = typeof prospects.$inferInsert;

export type ProspectAsset = typeof prospectAssets.$inferSelect;
export type NewProspectAsset = typeof prospectAssets.$inferInsert;

export type ProspectInsight = typeof prospectInsights.$inferSelect;
export type NewProspectInsight = typeof prospectInsights.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type NewConversationMessage = typeof conversationMessages.$inferInsert;

export type AiGeneration = typeof aiGenerations.$inferSelect;
export type NewAiGeneration = typeof aiGenerations.$inferInsert;

export type GeneratedMessage = typeof generatedMessages.$inferSelect;
export type NewGeneratedMessage = typeof generatedMessages.$inferInsert;

export type ScrapeJob = typeof scrapeJobs.$inferSelect;
export type NewScrapeJob = typeof scrapeJobs.$inferInsert;

export type GenerationJob = typeof generationJobs.$inferSelect;
export type NewGenerationJob = typeof generationJobs.$inferInsert;

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;

export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
