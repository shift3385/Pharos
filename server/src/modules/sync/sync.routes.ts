import type { FastifyInstance } from "fastify";
import type { TokenService } from "../auth/tokens";
import { makeRequireAuth } from "../auth/middleware";
import type { AppendRejected, KeyConflict, RemoteDoc, SyncRepository } from "./sync.repository";
import { isAppendOnly, keyBlocksSchema, pullSchema, pushSchema } from "./sync.schemas";
import {
  requireSupportedVersion,
  SERVER_FEATURES,
  SERVER_VERSION,
  sendsCompletePayload,
  understandsAppendOnly,
  understandsKeyConflicts,
} from "./sync.version";

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
    const appendRejected: AppendRejected[] = [];
    const readsKeyConflicts = understandsKeyConflicts(req);
    // Only a client that reads `appendRejected` may push append-only documents
    // (AUD-01); it only sends them after seeing `append-only` in `features`.
    if (!understandsAppendOnly(req) && deltas.some((d) => isAppendOnly(d.entity))) {
      return reply.code(400).send({
        code: "append_only_unsupported",
        message: "This client did not announce the append-only sync feature.",
      });
    }
    // An old client (no `complete-payload`) never resets a field it does not
    // know: its upserts keep the keys it leaves out.
    const merge = !sendsCompletePayload(req);
    for (const d of deltas) {
      const res = await repo.apply(userId, d, { merge });
      if ("current" in res) conflicts.push(res.current);
      else if ("appendRejected" in res) appendRejected.push(res.appendRejected);
      else if ("keyConflict" in res) {
        // A client built before DAT-01 would take the refused delta for an
        // accepted one and drop it. Stop it instead: nothing is marked synced
        // on its side, and what was stored so far is a no-op when it retries.
        if (!readsKeyConflicts) {
          return reply.code(426).send({
            code: "unsupported_client_version",
            message: `The key ${res.keyConflict.key} is already used by another item of the project. Update Pharos to sync this change.`,
            serverVersion: SERVER_VERSION,
          });
        }
        keyConflicts.push(res.keyConflict);
      }
    }
    return reply.send({
      accepted: deltas.length - conflicts.length - keyConflicts.length - appendRejected.length,
      conflicts,
      keyConflicts,
      // Only for clients that know the class; older ones get today's answer.
      ...(understandsAppendOnly(req) ? { appendRejected, features: SERVER_FEATURES } : {}),
    });
  });

  // Pull one page of changes after the client's cursor; `hasMore` tells the
  // client to ask again from the returned cursor (FIX-02). `features` tells the
  // client what this server understands (AUD-01).
  app.get("/sync/pull", { preHandler }, async (req, reply) => {
    const { since, limit } = pullSchema.parse(req.query);
    const appendOnly = understandsAppendOnly(req);
    const { docs, hasMore } = await repo.since(req.userId as string, since, limit, { appendOnly });
    const cursor = docs.length ? docs[docs.length - 1].seq : since;
    return reply.send({ docs, cursor, hasMore, ...(appendOnly ? { features: SERVER_FEATURES } : {}) });
  });

  // Lease blocks of key numbers so the device can number cases, requirements
  // and defects offline without colliding with another device (DAT-01).
  app.post("/sync/key-blocks", { preHandler }, async (req, reply) => {
    const { requests } = keyBlocksSchema.parse(req.body);
    return reply.send(await repo.leaseBlocks(req.userId as string, requests));
  });
}
