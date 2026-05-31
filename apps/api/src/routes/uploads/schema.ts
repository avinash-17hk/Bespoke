import { z } from "zod";

/** Optional override of the Cloudinary folder; defaults server-side. */
export const signUploadBody = z
  .object({
    folder: z.string().min(1).max(120).optional(),
  })
  .optional();
