import type { FastifyInstance } from "fastify";
import type { TokenService } from "../auth/tokens";
import { makeRequireAuth } from "../auth/middleware";
import type { RemoteDoc, SyncRepository } from "./sync.repository";
import { pullSchema, pushSchema } from "./sync.schemas";

/** Delta sync endpoints (spec §9). Everything is scoped to the authenticated
 *  user. A delta whose base the server no longer holds (or that loses
 *  last-write-wins by HLC) is rejected and its server version returned in
 *  `conflicts`, for the client's conflict panel. */
export function syncRoutes(
  app: FastifyInstance,
  deps: { repo: SyncRepository; tokens: TokenService },
) {
  const { repo, tokens } = deps;
  const requireAuth = makeRequireAuth(tokens);

  // Push local pending deltas; rejected ones come back as conflicts.
  app.post("/sync/push", { preHandler: requireAuth }, async (req, reply) => {
    const { deltas } = pushSchema.parse(req.body);
    const userId = req.userId as string;
    const conflicts: RemoteDoc[] = [];
    for (const d of deltas) {
      const res = await repo.apply(userId, d);
      if (!res.accepted) conflicts.push(res.current);
    }
    return reply.send({ accepted: deltas.length - conflicts.length, conflicts });
  });

  // Pull everything changed after the client's cursor.
  app.get("/sync/pull", { preHandler: requireAuth }, async (req, reply) => {
    const { since } = pullSchema.parse(req.query);
    const docs = await repo.since(req.userId as string, since);
    const cursor = docs.length ? docs[docs.length - 1].seq : since;
    return reply.send({ docs, cursor });
  });
}
