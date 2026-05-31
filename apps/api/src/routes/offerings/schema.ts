import { z } from "zod";

const name = z.string().min(1).max(200);
const longText = z.string().max(5000);
const mediumText = z.string().max(2000);

export const createOfferingBody = z.object({
  name,
  description: longText.optional(),
  targetAudience: mediumText.optional(),
  problemSolved: mediumText.optional(),
  uniqueValueProp: mediumText.optional(),
  proofPoints: mediumText.optional(),
  // Single URL kept for backward compatibility; sourceUrls is the multi-URL form.
  sourceUrl: z.string().url().optional(),
  sourceUrls: z.array(z.string().url()).max(5).optional(),
});

export const updateOfferingBody = z.object({
  name: name.optional(),
  description: longText.optional(),
  targetAudience: mediumText.optional(),
  problemSolved: mediumText.optional(),
  uniqueValueProp: mediumText.optional(),
  proofPoints: mediumText.optional(),
});

export const offeringIdParams = z.object({
  id: z.string().uuid(),
});

export const addSourceBody = z.object({
  url: z.string().url(),
});

export const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().max(200).optional(),
});

export const batchDeleteBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});
