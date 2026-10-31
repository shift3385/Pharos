import type { FastifyInstance } from "fastify";
import type { TokenService } from "../auth/tokens";
import { makeRequireAuth } from "../auth/middleware";
import type {
  AppendRejected,
  KeyConflict,
  RemoteDoc,
  SyncRepository,
} from "./sync.repository";
import {
  FEATURE_KEYS,
  isAppendOnly,
  isExecution,
  keyBlocksSchema,
  pullSchema,
  pushSchema,
} from "./sync.schemas";
import { flattenCaseData } from "./stable-steps";
import {
  readOnlyClient,
  requireSupportedVersion,
  SERVER_FEATURES,
  SERVER_VERSION,
  sendsCompletePayload,
  missingFeatures,
  sendsStableSteps,
  understandsAppendOnly,
  understandsKeyConflicts,
  understandsRuns,
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
    // A client that does not know stable steps may only read (DAT-02,
    // VERSIONING §6.5): nothing it sends is parsed or stored.
    if (!sendsStableSteps(req)) return readOnlyClient(reply);
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
    // Nor can an execution entity come from a client that never pulls them.
    if (!understandsRuns(req) && deltas.some((d) => isExecution(d.entity))) {
      return reply.code(400).send({
        code: "runs_unsupported",
        message: "This client did not announce the runs sync feature.",
      });
    }
    // An old client (no `complete-payload`) never resets a field it does not
    // know: its upserts keep the keys it leaves out. A newer one that lacks a
    // feature keeps the keys that feature added (`FEATURE_KEYS`).
    const merge = !sendsCompletePayload(req);
    const missing = missingFeatures(req);
    const keepFor = (entity: string) => missing.flatMap((f) => FEATURE_KEYS[f]?.[entity] ?? []);
    for (const d of deltas) {
      const res = await repo.apply(userId, d, { merge, keep: keepFor(d.entity) });
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
    const page = await repo.since(req.userId as string, since, limit, {
      appendOnly,
      runs: understandsRuns(req),
    });
    const { hasMore } = page;
    const cursor = page.docs.length
      ? page.docs[page.docs.length - 1].seq
      : since;
    // A read-only client gets cases in the text-step shape it knows (DAT-02).
    const docs = sendsStableSteps(req)
      ? page.docs
      : page.docs.map(asLegacyCase);
    return reply.send({
      docs,
      cursor,
      hasMore,
      ...(appendOnly ? { features: SERVER_FEATURES } : {}),
    });
  });

  // Lease blocks of key numbers so the device can number cases, requirements
  // and defects offline without colliding with another device (DAT-01).
  app.post("/sync/key-blocks", { preHandler }, async (req, reply) => {
    const { requests } = keyBlocksSchema.parse(req.body);
    return reply.send(await repo.leaseBlocks(req.userId as string, requests));
  });
}

/** A test_case document as clients without `stable-steps` know it. */
function asLegacyCase(doc: RemoteDoc): RemoteDoc {
  if (
    doc.entity !== "test_case" ||
    doc.deleted ||
    !doc.payload ||
    typeof doc.payload !== "object"
  )
    return doc;
  const payload = doc.payload as Record<string, unknown>;
  if (!("data" in payload)) return doc;
  return {
    ...doc,
    payload: { ...payload, data: flattenCaseData(payload.data) },
  };
}
