import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireAuth } from "../../plugins/auth";
import * as conversationsService from "../../services/conversations";
import {
  conversationIdParams,
  createConversationBody,
  listConversationsQuery,
  replyBody,
  statusBody,
} from "./schema";

const NOT_FOUND = {
  error: "Conversation not found",
  code: "NOT_FOUND",
} as const;

/** Conversation routes — start from a message, view threads, paste replies. */
export async function conversationRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", requireAuth);

  app.get(
    "/",
    { schema: { querystring: listConversationsQuery } },
    async (request) => ({
      data: await conversationsService.listConversations(
        request.userId,
        request.query.prospectId,
      ),
    }),
  );

  app.get(
    "/start-candidates",
    async (request) => ({
      data: await conversationsService.listStartCandidates(request.userId),
    }),
  );

  app.get(
    "/:id",
    { schema: { params: conversationIdParams } },
    async (request, reply) => {
      const conversation = await conversationsService.getConversation(
        request.userId,
        request.params.id,
      );
      if (!conversation) return reply.status(404).send(NOT_FOUND);
      return { data: conversation };
    },
  );

  app.post(
    "/",
    { schema: { body: createConversationBody } },
    async (request, reply) => {
      const result = await conversationsService.createFromMessage(
        request.userId,
        request.body.messageId,
      );
      if (result.status === "not_found") {
        return reply
          .status(404)
          .send({ error: "Message not found", code: "NOT_FOUND" });
      }
      return reply.status(201).send({ data: result.conversation });
    },
  );

  app.post(
    "/:id/replies",
    { schema: { params: conversationIdParams, body: replyBody } },
    async (request, reply) => {
      const result = await conversationsService.addReply(
        request.userId,
        request.params.id,
        request.body.content,
      );
      if (result.status === "not_found") {
        return reply.status(404).send(NOT_FOUND);
      }
      return reply.status(202).send({ data: result.conversation });
    },
  );

  app.patch(
    "/:id",
    { schema: { params: conversationIdParams, body: statusBody } },
    async (request, reply) => {
      const ok = await conversationsService.setStatus(
        request.userId,
        request.params.id,
        request.body.status,
      );
      if (!ok) return reply.status(404).send(NOT_FOUND);
      return { data: { ok: true } };
    },
  );

  app.delete(
    "/:id",
    { schema: { params: conversationIdParams } },
    async (request, reply) => {
      const ok = await conversationsService.deleteConversation(
        request.userId,
        request.params.id,
      );
      if (!ok) return reply.status(404).send(NOT_FOUND);
      return reply.status(204).send();
    },
  );
}
