import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireAuth } from "../../plugins/auth";
import { signUpload } from "../../lib/cloudinary";
import { signUploadBody } from "./schema";

/**
 * Upload routes. Issues short-lived Cloudinary upload signatures so the
 * browser uploads files directly to Cloudinary; the api never receives the
 * file bytes. Auth required — only signed-in users can request a signature.
 */
export async function uploadRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", requireAuth);

  app.post("/sign", { schema: { body: signUploadBody } }, async (request) => ({
    data: signUpload(request.body?.folder),
  }));
}
