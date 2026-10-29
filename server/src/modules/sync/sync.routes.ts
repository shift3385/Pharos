import type { FastifyInstance } from "fastify";
import type { TokenService } from "../auth/tokens";
import { makeRequireAuth } from "../auth/middleware";
import type { KeyConflict, RemoteDoc, SyncRepository } from "./sync.repository";
import { keyBlocksSchema, pullSchema, pushSchema } from "./sync.schemas";
import { requireSupportedVersion } from "./sync.version";

/** Delta sync endpoints (spec §9). Everything is scoped to the authenticated
 *  user, and only clients of a supported version are served (SYNC-08). A delta
 *  whose base the server no longer holds (or that loses last-write-wins by
 *  HLC) is rejected and its server version returned in `conflicts`, for the
 *  client's conflict panel. An upsert whose key another live document of the
 *  project uses is rejected in `keyConflicts` (DAT-01). */
export function syncRoutes(
  app: FastifyInstance,
  deps: { repo: SyncRepository; tokens: TokenService },
) {
  const { repo, tokens } = deps;
  // Authentication first, so an anonymous caller learns nothing (not even the
  // server version); then the version check, before anything is read or written.
  const preHandler = [makeRequireAuth(tokens), requireSupportedVersion];

  // Push one batch of local pending deltas; rejected ones come back as
  // conflicts. Clients split large pushes into batches (FIX-03).
  app.post("/sync/push", { preHandler }, async (req, reply) => {
    const { deltas } = pushSchema.parse(req.body);
    const userId = req.userId as string;
    const conflicts: RemoteDoc[] = [];
    const keyConflicts: KeyConflict[] = [];
    for (const d of deltas) {
      const res = await repo.apply(userId, d);
      if ("current" in res) conflicts.push(res.current);
      else if ("keyConflict" in res) keyConflicts.push(res.keyConflict);
    }
    return reply.send({
      accepted: deltas.length - conflicts.length - keyConflicts.length,
      conflicts,
      keyConflicts,
    });
  });

  // Pull one page of changes after the client's cursor; `hasMore` tells the
  // client to ask again from the returned cursor (FIX-02).
  app.get("/sync/pull", { preHandler }, async (req, reply) => {
    const { since, limit } = pullSchema.parse(req.query);
    const { docs, hasMore } = await repo.since(req.userId as string, since, limit);
    const cursor = docs.length ? docs[docs.length - 1].seq : since;
    return reply.send({ docs, cursor, hasMore });
  });

  // Lease blocks of key numbers so the device can number cases, requirements
  // and defects offline without colliding with another device (DAT-01).
  app.post("/sync/key-blocks", { preHandler }, async (req, reply) => {
    const { requests } = keyBlocksSchema.parse(req.body);
    return reply.send(await repo.leaseBlocks(req.userId as string, requests));
  });
}
