import { z } from "zod";

export const createConversationBody = z.object({
  messageId: z.string().uuid(),
});

export const listConversationsQuery = z.object({
  prospectId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const conversationIdParams = z.object({
  id: z.string().uuid(),
});

export const replyBody = z.object({
  content: z.string().min(1).max(10000),
});

export const statusBody = z.object({
  status: z.enum(["active", "archived"]),
});
