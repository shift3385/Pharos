import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { TokenService } from "../auth/tokens.js";
import { makeRequireAuth } from "../auth/middleware.js";
import { requireSupportedVersion } from "../sync/sync.version.js";
import { WEBHOOK_EVENTS } from "./events.js";
import { WebhookErrors, type WebhookService } from "./webhooks.service.js";

// Webhooks of a workspace (INT-03, ADR-0052 §2.2 and §4). Only with a session
// of the app or the web, never with an API token. Who may do what is checked
// in the service: every member reads, `token.manage` changes.

const events = z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length);
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().min(1).max(2000),
  projectId: z.string().min(1).max(200).nullable().default(null),
  events,
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  url: z.string().trim().min(1).max(2000).optional(),
  projectId: z.string().min(1).max(200).nullable().optional(),
  events: events.optional(),
  active: z.boolean().optional(),
});

export function webhookRoutes(app: FastifyInstance, deps: { service: WebhookService; tokens: TokenService }) {
  const { service } = deps;
  const preHandler = [makeRequireAuth(deps.tokens), requireSupportedVersion];
  const user = (req: FastifyRequest) => req.userId as string;
  const p = (req: FastifyRequest, k: string) => (req.params as Record<string, string>)[k];
  const uuid = (req: FastifyRequest, k: string) => {
    const v = z.uuid().safeParse(p(req, k));
    if (!v.success) throw k === "delivery" ? WebhookErrors.delivery() : WebhookErrors.notFound();
    return v.data;
  };

  app.get("/workspaces/:id/webhooks", { preHandler }, async (req) => ({
    webhooks: await service.list(user(req), p(req, "id")),
    enabled: service.enabled(),
  }));
  app.post("/workspaces/:id/webhooks", { preHandler }, async (req, reply) =>
    reply.code(201).send(await service.create(user(req), p(req, "id"), createSchema.parse(req.body))),
  );
  app.patch("/workspaces/:id/webhooks/:hook", { preHandler }, async (req) =>
    service.update(user(req), p(req, "id"), uuid(req, "hook"), updateSchema.parse(req.body ?? {})),
  );
  app.delete("/workspaces/:id/webhooks/:hook", { preHandler }, async (req, reply) => {
    await service.remove(user(req), p(req, "id"), uuid(req, "hook"));
    return reply.code(204).send();
  });
  app.post("/workspaces/:id/webhooks/:hook/rotate-secret", { preHandler }, async (req) =>
    service.rotate(user(req), p(req, "id"), uuid(req, "hook")),
  );
  app.post("/workspaces/:id/webhooks/:hook/test", { preHandler }, async (req, reply) =>
    reply.code(202).send(await service.test(user(req), p(req, "id"), uuid(req, "hook"))),
  );
  app.get("/workspaces/:id/webhooks/:hook/deliveries", { preHandler }, async (req) => ({
    deliveries: await service.deliveries(user(req), p(req, "id"), uuid(req, "hook")),
  }));
  app.post("/workspaces/:id/webhooks/:hook/deliveries/:delivery/redeliver", { preHandler }, async (req, reply) => {
    await service.redeliver(user(req), p(req, "id"), uuid(req, "hook"), uuid(req, "delivery"));
    return reply.code(202).send({ queued: true });
  });
}
