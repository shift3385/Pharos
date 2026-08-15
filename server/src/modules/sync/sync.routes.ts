import type { FastifyInstance } from "fastify";
import type { TokenService } from "../auth/tokens";
import { makeRequireAuth } from "../auth/middleware";
import type { SyncRepository } from "./sync.repository";
import { pullSchema, pushSchema } from "./sync.schemas";

/** Delta sync endpoints (spec §9). Everything is scoped to the authenticated
 *  user; conflicts resolve per-entity last-write-wins by revision. */
export function syncRoutes(
  app: FastifyInstance,
  deps: { repo: SyncRepository; tokens: TokenService },
) {
  const { repo, tokens } = deps;
  const requireAuth = makeRequireAuth(tokens);

  // Push local pending deltas; server keeps the newest revision per entity.
  app.post("/sync/push", { preHandler: requireAuth }, async (req, reply) => {
    const { deltas } = pushSchema.parse(req.body);
    const userId = req.userId as string;
    for (const d of deltas) await repo.apply(userId, d);
    return reply.send({ accepted: deltas.length });
  });

  // Pull everything changed after the client's cursor.
  app.get("/sync/pull", { preHandler: requireAuth }, async (req, reply) => {
    const { since } = pullSchema.parse(req.query);
    const docs = await repo.since(req.userId as string, since);
    const cursor = docs.length ? docs[docs.length - 1].seq : since;
    return reply.send({ docs, cursor });
  });
}
