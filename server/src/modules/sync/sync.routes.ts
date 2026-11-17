import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { TokenService } from "../auth/tokens";
import { makeRequireAuth } from "../auth/middleware";
import type {
  AppendRejected,
  KeyConflict,
  Rejected,
  RemoteDoc,
  SyncRepository,
} from "./sync.repository";
import { syncWorkspace } from "../workspaces/access";
import { memberships } from "../workspaces/members";
import { can } from "../workspaces/roles";
import {
  FEATURE_DATA_KEYS,
  FEATURE_KEYS,
  isAppendOnly,
  isCycleEntity,
  isDefectEntity,
  isExecution,
  keyBlocksSchema,
  pullSchema,
  pushSchema,
} from "./sync.schemas";
import { flattenCaseData } from "./stable-steps";
import { CASE_FIELDS_STASH_KEY } from "../domain/custom-fields";
import {
  readOnlyClient,
  requireSupportedVersion,
  SERVER_FEATURES,
  SERVER_VERSION,
  sendsCompletePayload,
  missingFeatures,
  sendsStableSteps,
  understandsAppendOnly,
  understandsCycles,
  understandsKeyConflicts,
  understandsDefects,
  understandsRuns,
  readOnlyByWorkspaces,
  understandsWorkspaces,
} from "./sync.version";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Delta sync endpoints (spec §9). Everything is scoped to one workspace of
 *  the authenticated user (SYNC-07, ADR-0042 §2): a client with
 *  `workspaces` names it; a development build of this minor without it works
 *  in its personal workspace; a client of an earlier minor without it may
 *  only read, the union of its workspaces (§3). Only clients of a supported
 *  version are served (SYNC-08). A delta the role does not allow, or for an
 *  entity that lives in another workspace, is refused in `rejected`. A delta
 *  whose base the server no longer holds (or that loses last-write-wins by
 *  HLC) is rejected and its server version returned in `conflicts`, for the
 *  client's conflict panel. An upsert whose key another live document of the
 *  project uses is rejected in `keyConflicts` (DAT-01). */
export function syncRoutes(
  app: FastifyInstance,
  deps: { repo: SyncRepository; tokens: TokenService; pool: Pool },
) {
  const { repo, tokens, pool } = deps;
  // Authentication first, so an anonymous caller learns nothing (not even the
  // server version); then the version check, before anything is read or written.
  const preHandler = [makeRequireAuth(tokens), requireSupportedVersion];

  // Push one batch of local pending deltas; rejected ones come back as
  // conflicts. Clients split large pushes into batches (FIX-03).
  app.post("/sync/push", { preHandler }, async (req, reply) => {
    // A client that does not know stable steps (DAT-02), or one of the
    // earlier minor that does not know workspaces (ADR-0042 §3), may only
    // read (VERSIONING §6.5): nothing it sends is parsed or stored.
    if (!sendsStableSteps(req) || readOnlyByWorkspaces(req)) return readOnlyClient(reply);
    const { deltas, workspaceId: requested } = pushSchema.parse(req.body);
    const userId = req.userId as string;
    const knowsWorkspaces = understandsWorkspaces(req);
    const ws = await syncWorkspace(pool, userId, knowsWorkspaces, requested);
    const scope = { workspaceId: ws.workspaceId, userId, role: ws.role, kind: ws.kind };
    // A custom field's type never changes (FLD-01): nothing of the batch is
    // stored if one tries.
    const retyped = await repo.changedFieldTypes(ws.workspaceId, deltas);
    if (retyped.length > 0) {
      return reply.code(400).send({
        code: "custom_field_immutable",
        message: `The type of custom field ${retyped[0]} cannot change.`,
      });
    }
    const conflicts: RemoteDoc[] = [];
    const rejected: Rejected[] = [];
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
    if (!understandsCycles(req) && deltas.some((d) => isCycleEntity(d.entity))) {
      return reply.code(400).send({
        code: "cycles_unsupported",
        message: "This client did not announce the cycles sync feature.",
      });
    }
    // Defects have their own entity since DEF-01: a client that does not
    // know it can neither push one nor touch a planner defect card, which the
    // server converted (migration 0010). Nothing of the batch is stored.
    if (
      !understandsDefects(req) &&
      (deltas.some((d) => isDefectEntity(d.entity)) || (await repo.touchesDefectCards(ws.workspaceId, deltas)))
    ) {
      return reply.code(400).send({
        code: "defects_unsupported",
        message: "This client did not announce the defects sync feature; update Pharos to change defects.",
      });
    }
    // An old client (no `complete-payload`) never resets a field it does not
    // know: its upserts keep the keys it leaves out. A newer one that lacks a
    // feature keeps the keys that feature added (`FEATURE_KEYS`).
    const merge = !sendsCompletePayload(req);
    const missing = missingFeatures(req);
    const keepFor = (entity: string) => missing.flatMap((f) => FEATURE_KEYS[f]?.[entity] ?? []);
    const keepDataFor = (entity: string) => missing.flatMap((f) => FEATURE_DATA_KEYS[f]?.[entity] ?? []);
    for (const d of deltas) {
      const res = await repo.apply(scope, d, { merge, keep: keepFor(d.entity), keepData: keepDataFor(d.entity) });
      if ("current" in res) conflicts.push(res.current);
      else if ("rejected" in res) {
        // A client without `workspaces` does not read `rejected` and would
        // take the delta for accepted. Stop it, as for a key conflict.
        if (!knowsWorkspaces) {
          return reply.code(426).send({
            code: "unsupported_client_version",
            message: "This change belongs to another workspace. Update Pharos to sync it.",
            serverVersion: SERVER_VERSION,
          });
        }
        rejected.push(res.rejected);
      }
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
      accepted: deltas.length - conflicts.length - keyConflicts.length - appendRejected.length - rejected.length,
      conflicts,
      keyConflicts,
      ...(knowsWorkspaces ? { rejected } : {}),
      // Only for clients that know the class; older ones get today's answer.
      ...(understandsAppendOnly(req) ? { appendRejected, features: SERVER_FEATURES } : {}),
    });
  });

  // Pull one page of changes after the client's cursor; `hasMore` tells the
  // client to ask again from the returned cursor (FIX-02). `features` tells the
  // client what this server understands (AUD-01).
  app.get("/sync/pull", { preHandler }, async (req, reply) => {
    const { since, limit, workspace } = pullSchema.parse(req.query);
    const appendOnly = understandsAppendOnly(req);
    const userId = req.userId as string;
    // A client with `workspaces` pulls one workspace with its own cursor
    // (`workspace`); without one, or without the feature, the union of all
    // of them with a single cursor, and a client without the feature gets no
    // move tombstones (ADR-0042 §3).
    const scoped = understandsWorkspaces(req) && workspace !== undefined;
    const members = scoped
      ? [await syncWorkspace(pool, userId, true, workspace)]
      : await memberships(pool, userId);
    const page = await repo.since(
      members.map((m) => m.workspaceId),
      since,
      limit,
      {
        appendOnly,
        runs: understandsRuns(req),
        cycles: understandsCycles(req),
        defects: understandsDefects(req),
        legacy: !understandsWorkspaces(req),
        auditIn: members.filter((m) => can(m.role, "audit.read")).map((m) => m.workspaceId),
      },
    );
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
    const { requests, workspaceId: requested } = keyBlocksSchema.parse(req.body);
    const userId = req.userId as string;
    const ws = await syncWorkspace(pool, userId, understandsWorkspaces(req), requested);
    return reply.send(await repo.leaseBlocks({ workspaceId: ws.workspaceId, userId, role: ws.role, kind: ws.kind }, requests));
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
  // It has no column for the case fields: they travel in `data`, where it
  // keeps them until it upgrades (migration 0027, FLD-01).
  const caseFields = Object.fromEntries(
    (["caseType", "automationStatus"] as const)
      .filter((k) => typeof payload[k] === "string")
      .map((k) => [k, payload[k]]),
  );
  const data = flattenCaseData(payload.data);
  return {
    ...doc,
    payload: {
      ...payload,
      data:
        Object.keys(caseFields).length && isRecord(data)
          ? { ...data, [CASE_FIELDS_STASH_KEY]: caseFields }
          : data,
    },
  };
}
