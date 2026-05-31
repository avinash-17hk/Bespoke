import Fastify, { type FastifyError } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { config } from "./config";
import { AppError } from "./lib/errors";
import { corsPlugin } from "./plugins/cors";
import { authPlugin, requireAuth } from "./plugins/auth";
import { offeringRoutes } from "./routes/offerings/index";
import { promptRoutes } from "./routes/prompts/index";
import { prospectRoutes } from "./routes/prospects/index";
import { uploadRoutes } from "./routes/uploads/index";
import { settingsRoutes } from "./routes/settings/index";
import { generationRoutes } from "./routes/generations/index";
import { messageRoutes } from "./routes/messages/index";
import { conversationRoutes } from "./routes/conversations/index";
import { analyticsRoutes } from "./routes/analytics/index";
import { aiRoutes } from "./routes/ai/index";

/**
 * Fastify bootstrap. CORS is registered before the auth handler. Zod drives
 * request validation and response serialization. Domain route plugins mount
 * under their `/api/*` prefixes.
 */
async function main(): Promise<void> {
  const app = Fastify({
    logger: { level: config.NODE_ENV === "production" ? "info" : "debug" },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Map validation and unexpected errors to the standard { error, code } shape.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: "Invalid request",
        code: "VALIDATION_ERROR",
        issues: error.validation.map((issue) => ({
          path: issue.instancePath.replace(/^\//, "").replace(/\//g, "."),
          message: issue.message ?? "Invalid value",
        })),
      });
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      });
    }
    request.log.error({ error }, "Unhandled error");
    const status = error.statusCode ?? 500;
    return reply.status(status).send({
      error: error.message ?? "Internal server error",
      code: error.code ?? "INTERNAL_ERROR",
    });
  });

  await app.register(corsPlugin);
  await app.register(authPlugin);

  app.get("/health", async () => ({ data: { status: "ok" } }));

  app.get("/api/me", { preHandler: requireAuth }, async (request) => ({
    data: { user: request.session.user },
  }));

  await app.register(offeringRoutes, { prefix: "/api/offerings" });
  await app.register(promptRoutes, { prefix: "/api/prompts" });
  await app.register(prospectRoutes, { prefix: "/api/prospects" });
  await app.register(uploadRoutes, { prefix: "/api/uploads" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(generationRoutes, { prefix: "/api/generations" });
  await app.register(messageRoutes, { prefix: "/api/messages" });
  await app.register(conversationRoutes, { prefix: "/api/conversations" });
  await app.register(analyticsRoutes, { prefix: "/api/analytics" });
  await app.register(aiRoutes, { prefix: "/api/ai" });

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
