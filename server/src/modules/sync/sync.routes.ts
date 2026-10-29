import type { FastifyInstance } from "fastify";
import type { TokenService } from "../auth/tokens";
import { makeRequireAuth } from "../auth/middleware";
import type { RemoteDoc, SyncRepository } from "./sync.repository";
import { pullSchema, pushSchema } from "./sync.schemas";
import { requireSupportedVersion } from "./sync.version";

/** Delta sync endpoints (spec §9). Everything is scoped to the authenticated
 *  user, and only clients of a supported version are served (SYNC-08): the
 *  version check runs first, before anything is read or written. A delta
 *  whose base the server no longer holds (or that loses last-write-wins by
 *  HLC) is rejected and its server version returned in `conflicts`, for the
 *  client's conflict panel. */
export function syncRoutes(
  app: FastifyInstance,
  deps: { repo: SyncRepository; tokens: TokenService },
) {
  const { repo, tokens } = deps;
  const preHandler = [requireSupportedVersion, makeRequireAuth(tokens)];

  // Push one batch of local pending deltas; rejected ones come back as
  // conflicts. Clients split large pushes into batches (FIX-03).
  app.post("/sync/push", { preHandler }, async (req, reply) => {
    const { deltas } = pushSchema.parse(req.body);
    const userId = req.userId as string;
    const conflicts: RemoteDoc[] = [];
    for (const d of deltas) {
      const res = await repo.apply(userId, d);
      if (!res.accepted) conflicts.push(res.current);
    }
    return reply.send({ accepted: deltas.length - conflicts.length, conflicts });
  });

  // Pull one page of changes after the client's cursor; `hasMore` tells the
  // client to ask again from the returned cursor (FIX-02).
  app.get("/sync/pull", { preHandler }, async (req, reply) => {
    const { since, limit } = pullSchema.parse(req.query);
    const { docs, hasMore } = await repo.since(req.userId as string, since, limit);
    const cursor = docs.length ? docs[docs.length - 1].seq : since;
    return reply.send({ docs, cursor, hasMore });
  });
}
