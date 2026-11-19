import type { Pool, PoolClient } from "pg";
import { decide } from "./sync.merge";
import { can, capabilityFor, type Capability, type WorkspaceRole } from "../workspaces/roles";
import { membership } from "../workspaces/members";
import {
  isProvisionalKey,
  KEY_BLOCK_SIZE,
  KEY_ENTITY,
  KEY_FIELD,
  APPEND_ONLY_ENTITIES,
  BASELINE_ENTITIES,
  LIBRARY_ENTITIES,
  FINDING_ENTITIES,
  BLOB_ENTITIES,
  CYCLE_ENTITIES,
  DEFECT_ENTITIES,
  EXECUTION_ENTITIES,
  isAppendOnly,
  LOCATION_KEYS,
  outsideContent,
  MAX_PULL_LIMIT,
  PROJECT_CHILDREN,
  type Delta,
  type KeyKind,
} from "./sync.schemas";

/** A pool, or a client inside a transaction. */
type Queryable = Pick<Pool, "query"> | PoolClient;

/** Where a write lands and who makes it (SYNC-07, ADR-0042 §4): the
 *  workspace partitions the store; the user is the author of the version
 *  stored. */
export interface Scope {
  workspaceId: string;
  userId: string;
}

/** A device push or a key lease: the user's role there is checked per delta
 *  (`apply`) or per request (`leaseBlocks`). */
export interface PushScope extends Scope {
  role: WorkspaceRole;
  kind: "personal" | "shared";
}

export interface RemoteDoc {
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  revision: number;
  author: string;
  deleted: boolean;
  hlc: string;
  seq: number;
}

/** A pushed key another live document of the project already uses (DAT-01). */
export interface KeyConflict {
  entity: string;
  entityId: string;
  key: string;
  /** The document that holds the key. */
  takenBy: string;
}

/** Outcome of one pushed delta: accepted; rejected as a conflict together with
 *  the version the server keeps (sent back so the client can show it); or
 *  rejected because its key is taken (DAT-01); or refused (ADR-0042 §2). */
export type ApplyResult =
  | { accepted: true }
  | { accepted: false; current: RemoteDoc }
  | { accepted: false; keyConflict: KeyConflict }
  | { accepted: false; appendRejected: AppendRejected }
  | { accepted: false; rejected: Rejected };

/** A pushed append-only document the server refuses (AUD-01): its id is
 *  already held with other content (`content_changed`; it is never
 *  overwritten), or it claims the server's own web audit chain
 *  (`reserved_chain`, AUD-01b: only the server writes device "web"). Only a
 *  bug or tampering on the device produces one. */
export interface AppendRejected {
  entity: string;
  entityId: string;
  reason: "content_changed" | "reserved_chain";
}

/** A pushed delta the server refuses without writing anything (ADR-0042
 *  §2): the role does not allow it (`forbidden`); the entity lives in
 *  another workspace of the user (`moved`, with its id); or in a workspace
 *  the user does not belong to (`not_found`: which one is not said). */
export interface Rejected {
  entity: string;
  entityId: string;
  reason: "forbidden" | "moved" | "not_found";
  workspaceId?: string;
}

/** The device id of the audit chain the server writes for web edits
 *  (`audit.store.ts`). */
export const WEB_AUDIT_DEVICE = "web";

/** A block of key numbers leased to a device, both ends included. */
export interface KeyBlock {
  projectId: string;
  kind: KeyKind;
  start: number;
  end: number;
}

/** The key expression of `documents_key_idx`, textually equal to it
 *  (migration 0006; `runKey` since 0008, `cycleKey` since 0009,
 *  `defectKey` since 0010; per workspace since 0019). */
export const KEY_SQL =
  "coalesce(payload->>'scenarioId', payload->>'requirementKey', payload->>'cardKey', payload->>'runKey', payload->>'cycleKey', payload->>'defectKey')";

/** One pull page: documents after the cursor and whether more remain. */
export interface PullPage {
  docs: RemoteDoc[];
  hasMore: boolean;
}

export const COLS = "entity, entity_id, payload, revision, author, deleted, hlc, seq";

/** True in SQL for the tombstone a move leaves in its origin workspace
 *  (`move-project`, ADR-0042 §5): the entity lives on elsewhere. */
export const MOVE_TOMBSTONE_SQL = "(deleted AND payload ? 'movedTo')";

export function toDoc(r: Record<string, unknown>): RemoteDoc {
  return {
    entity: r.entity as string,
    entityId: r.entity_id as string,
    payload: r.payload as Record<string, unknown>,
    revision: r.revision as number,
    author: r.author as string,
    deleted: r.deleted as boolean,
    hlc: r.hlc as string,
    seq: Number(r.seq),
  };
}

/** Serializes one workspace's writes until the transaction ends. `seq` comes
 *  from `nextval()` inside the transaction, so without this a transaction that
 *  took a lower seq could commit after a client already pulled past a higher
 *  one, and the client would never see it. With one writer per workspace at a
 *  time, a workspace's seqs become visible in order. Every writer of the
 *  workspace (device pushes, the web, `move-project`) takes it. */
export const LOCK_WORKSPACE_SQL = "SELECT pg_advisory_xact_lock(hashtext($1))";

/** The same lock in shared mode: a reader of several workspaces at once (the
 *  pull of a client without `workspaces`, ADR-0042 §3) waits for their
 *  writers to commit, so it never skips a lower `seq` still in flight. */
export const LOCK_WORKSPACE_SHARED_SQL = "SELECT pg_advisory_xact_lock_shared(hashtext($1))";

/** Takes the locks of several workspaces in one order (by id), so two
 *  transactions that both take two never wait for each other. */
export async function lockWorkspaces(client: PoolClient, ids: string[], shared = false): Promise<void> {
  for (const id of [...new Set(ids)].sort()) {
    await client.query(shared ? LOCK_WORKSPACE_SHARED_SQL : LOCK_WORKSPACE_SQL, [id]);
  }
}

/** Deleting a project deletes its plans, cases, requirements, planner
 *  cards and custom fields in the same transaction (FIX-05, ADR-0020), whichever client sent
 *  it. Each child gets a tombstone with a new `seq`, so every device pulls it;
 *  a device with a pending edit of that child sees a conflict, not a loss.
 *  A child's HLC never goes backwards (a newer child edit keeps its HLC), so
 *  a stale web upsert cannot win last-write-wins against the tombstone. */
async function cascadeProjectDelete(client: PoolClient, scope: Scope, d: Delta): Promise<Record<string, number>> {
  const { rows } = await client.query<{ entity: string }>(
    `UPDATE documents
        SET deleted = true, revision = revision + 1, hlc = GREATEST(hlc, $3), author = $4,
            author_user_id = $6, updated_at = now(), seq = nextval('documents_seq')
      WHERE workspace_id = $1 AND entity = ANY($5::text[]) AND NOT deleted
        AND payload->>'projectId' = $2
      RETURNING entity`,
    [scope.workspaceId, d.entityId, d.hlc, d.author, [...PROJECT_CHILDREN], scope.userId],
  );
  // Its case revisions too (SYNC-11), marked `deletedWith` so they come back
  // if the project does. Not counted: on the desktop they go with their
  // cases. Runs after the children, so the results and run items of the
  // project are already tombstones and only another project's live ones can
  // keep a revision.
  await client.query(REVISION_TOMBSTONE_SQL, [scope.workspaceId, d.entityId, d.hlc, d.author, scope.userId]);
  const counted = PROJECT_CHILDREN.filter((e) => CASCADE_KEY[e]);
  const counts: Record<string, number> = Object.fromEntries(counted.map((e) => [CASCADE_KEY[e], 0]));
  for (const r of rows) {
    const key = CASCADE_KEY[r.entity as (typeof PROJECT_CHILDREN)[number]];
    if (key) counts[key]++;
  }
  return counts;
}

/** Tombstones the case revisions of a deleted project (SYNC-11, ADR-0051):
 *  `$1` workspace, `$2` project, `$3` the delete's HLC, `$4` author, `$5` user.
 *  Append-only, so the only change allowed is the tombstone itself; the
 *  content stays until `compactTombstones` clears it, and `deletedWith`
 *  says which project took it. A revision a live result or run item of
 *  another project still points to is left alone, so that result keeps its
 *  link. */
export const REVISION_TOMBSTONE_SQL = `
  UPDATE documents r
     SET deleted = true, payload = r.payload || jsonb_build_object('deletedWith', $2::text),
         revision = r.revision + 1, hlc = GREATEST(r.hlc, $3), author = $4, author_user_id = $5,
         updated_at = now(), seq = nextval('documents_seq')
   WHERE r.workspace_id = $1 AND r.entity = 'test_case_revision' AND NOT r.deleted
     AND r.payload->>'projectId' = $2
     AND NOT EXISTS (
       SELECT 1 FROM documents o
        WHERE o.workspace_id = r.workspace_id AND o.entity IN ('result', 'run_item') AND NOT o.deleted
          AND o.payload->>'testCaseRevisionId' = r.entity_id
          AND o.payload->>'projectId' IS DISTINCT FROM $2)`;

/** Brings back the case revisions a project's delete tombstoned, when the
 *  project is stored live again (SYNC-11): the only way an append-only
 *  tombstone comes back, and only while it still has its content. */
async function reviveProjectRevisions(client: PoolClient, scope: Scope, projectId: string): Promise<void> {
  await client.query(
    `UPDATE documents
        SET deleted = false, payload = payload - 'deletedWith', revision = revision + 1,
            updated_at = now(), seq = nextval('documents_seq')
      WHERE workspace_id = $1 AND entity = 'test_case_revision' AND deleted
        AND payload->>'projectId' = $2 AND payload->>'deletedWith' = $2`,
    [scope.workspaceId, projectId],
  );
}

/** How a cascade counts each child: the desktop's table names
 *  (`project.rs`), so a web project delete reads like a desktop one in the
 *  audit log. Shards and results are tombstoned but not counted: on the
 *  desktop they go with their runs. */
const CASCADE_KEY: Partial<Record<(typeof PROJECT_CHILDREN)[number], string>> = {
  test_plan: "test_plans",
  test_case: "test_cases",
  requirement: "requirements",
  planner_card: "planner_cards",
  custom_field: "custom_fields",
  run: "runs",
  run_item: "run_items",
  unlinked_mapping: "unlinked_mappings",
  configuration: "configurations",
  test_cycle: "test_cycles",
  test_cycle_item: "test_cycle_items",
  defect: "defects",
  defect_link: "defect_links",
  attachment: "attachments",
};

/** The live document of the same project that already uses the key of an
 *  upsert (DAT-01), as a key conflict; null when the key is free, empty or
 *  provisional. Runs under the workspace's write lock, so two pushes of the
 *  same key cannot both pass. */
export async function takenKey(client: PoolClient, workspaceId: string, d: Delta): Promise<KeyConflict | null> {
  const field = KEY_FIELD[d.entity];
  const key = field ? d.payload[field] : undefined;
  if (d.op !== "upsert" || typeof key !== "string" || !key || isProvisionalKey(key)) return null;
  const { rows } = await client.query<{ entity_id: string }>(
    `SELECT entity_id FROM documents
      WHERE workspace_id = $1 AND entity = $2 AND NOT deleted
        AND payload->>'projectId' = $3 AND ${KEY_SQL} = $4 AND entity_id <> $5
      LIMIT 1`,
    [workspaceId, d.entity, String(d.payload.projectId ?? ""), key, d.entityId],
  );
  return rows[0] ? { entity: d.entity, entityId: d.entityId, key, takenBy: rows[0].entity_id } : null;
}

/** Another workspace the user belongs to, or once belonged to, where the
 *  entity lives (its live document or a tombstone that is not a move's), or
 *  null. A delta for it pushed to `workspaceId` would fork it (ADR-0042 §2):
 *  a project moved since, or kept by a device after its user was removed.
 *  Workspaces the user never belonged to do not count: their documents are
 *  someone else's and two accounts never shared ids before workspaces. */
export async function livesElsewhere(
  q: Queryable,
  workspaceId: string,
  userId: string,
  entity: string,
  entityId: string,
): Promise<string | null> {
  const { rows } = await q.query<{ workspace_id: string }>(
    `SELECT d.workspace_id FROM documents d
       JOIN workspace_members m ON m.workspace_id = d.workspace_id AND m.user_id = $4
      WHERE d.entity = $1 AND d.entity_id = $2 AND d.workspace_id <> $3 AND NOT (d.deleted AND d.payload ? 'movedTo')
      ORDER BY d.deleted, d.seq DESC LIMIT 1`,
    [entity, entityId, workspaceId, userId],
  );
  return rows[0]?.workspace_id ?? null;
}

/** The payload stored when an upsert from an OLD client (one that does not
 *  send the `complete-payload` feature: 0.1.x, 0.2.0-alpha.1) lands on a live
 *  document: a key it left out keeps the stored value, and `data` is merged one
 *  level deep the same way (VERSIONING §6.5, design 0.2.0 §3.7), so it can
 *  never reset a field it does not know. Current clients send their whole
 *  state and may clear a key by omitting it, so their payload is stored as is
 *  (and so are the web's domain writes). A tombstone, or a delete, is never
 *  merged: merging never brings back what was deleted. */
const MERGED_PAYLOAD_SQL = `CASE WHEN documents.deleted OR EXCLUDED.deleted THEN EXCLUDED.payload
       ELSE (documents.payload || EXCLUDED.payload)
         || CASE WHEN jsonb_typeof(documents.payload->'data') = 'object'
                  AND jsonb_typeof(EXCLUDED.payload->'data') = 'object'
                 THEN jsonb_build_object('data', (documents.payload->'data') || (EXCLUDED.payload->'data'))
                 ELSE '{}'::jsonb END
     END`;

/** The payload stored when an upsert from a client that sends its whole
 *  state lands on a live document, but the client lacks a feature that added
 *  keys to the entity (`FEATURE_KEYS`, `FEATURE_DATA_KEYS`): those keys
 *  ($10 at the top level, $11 inside `data`), when it left them out, keep the
 *  stored value. Everything else is its payload as is. */
const KEPT_PAYLOAD_SQL = `CASE WHEN documents.deleted OR EXCLUDED.deleted THEN EXCLUDED.payload
       ELSE (EXCLUDED.payload || coalesce(
         (SELECT jsonb_object_agg(k.key, k.value) FROM jsonb_each(documents.payload) AS k
           WHERE k.key = ANY($10::text[]) AND NOT (EXCLUDED.payload ? k.key)),
         '{}'::jsonb))
         || CASE WHEN jsonb_typeof(EXCLUDED.payload->'data') = 'object'
                  AND jsonb_typeof(documents.payload->'data') = 'object'
                 THEN jsonb_build_object('data', (EXCLUDED.payload->'data') || coalesce(
                   (SELECT jsonb_object_agg(k.key, k.value) FROM jsonb_each(documents.payload->'data') AS k
                     WHERE k.key = ANY($11::text[]) AND NOT ((EXCLUDED.payload->'data') ? k.key)),
                   '{}'::jsonb))
                 ELSE '{}'::jsonb END
     END`;

export interface StoreOpts {
  /** The client is old (no `complete-payload`): keep every key it left out. */
  merge: boolean;
  /** Top-level keys of features the client lacks (`FEATURE_KEYS`). */
  keep?: readonly string[];
  /** Keys inside `data` of features the client lacks (`FEATURE_DATA_KEYS`). */
  keepData?: readonly string[];
}

/** The payload with its `workspaceId`, when it carries one, set to the
 *  workspace it is stored in: the location is the server's to say (ADR-0042
 *  §4). It is outside the content of append-only documents and outside the
 *  audit hash, so this never changes what a document is. */
export function located(payload: Record<string, unknown>, workspaceId: string): Record<string, unknown> {
  return "workspaceId" in payload && payload.workspaceId !== workspaceId ? { ...payload, workspaceId } : payload;
}

/** Stores a delta as the workspace's latest version of the entity (with a
 *  new `seq`) and cascades a project delete to its children. The caller holds
 *  the workspace's write lock and has already decided that the delta wins.
 *  `merge`: keep the keys the delta left out (only for old clients, above);
 *  `keep`: keep just these keys when left out (`KEPT_PAYLOAD_SQL`). Returns
 *  the payload stored and, for a project delete, how many children it
 *  removed (the web's audit event reads both, AUD-01b). */
export async function storeDoc(
  client: PoolClient,
  scope: Scope,
  d: Delta,
  opts: StoreOpts = { merge: false },
): Promise<{ payload: Record<string, unknown>; cascade: Record<string, number> | null }> {
  const keep = opts.keep ?? [];
  const keepData = opts.keepData ?? [];
  const kept = !opts.merge && (keep.length > 0 || keepData.length > 0);
  const payloadSql = opts.merge ? MERGED_PAYLOAD_SQL : kept ? KEPT_PAYLOAD_SQL : "EXCLUDED.payload";
  const params: unknown[] = [
    scope.workspaceId,
    d.entity,
    d.entityId,
    located(d.payload, scope.workspaceId),
    d.revision,
    d.author,
    d.op === "delete",
    d.hlc,
    scope.userId,
  ];
  if (kept) params.push([...keep], [...keepData]);
  const { rows } = await client.query<{ payload: Record<string, unknown> }>(
    `INSERT INTO documents
       (workspace_id, entity, entity_id, payload, revision, author, deleted, hlc, author_user_id, updated_at, seq)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), nextval('documents_seq'))
     ON CONFLICT (workspace_id, entity, entity_id) DO UPDATE
       SET payload = ${payloadSql},
           revision = EXCLUDED.revision,
           author = EXCLUDED.author,
           author_user_id = EXCLUDED.author_user_id,
           deleted = EXCLUDED.deleted,
           hlc = EXCLUDED.hlc,
           updated_at = now(),
           seq = nextval('documents_seq')
     RETURNING payload`,
    params,
  );
  const cascade = d.entity === "project" && d.op === "delete" ? await cascadeProjectDelete(client, scope, d) : null;
  // A project that comes back (its delete lost a conflict elsewhere) brings
  // back the case revisions its delete took (SYNC-11).
  if (d.entity === "project" && d.op !== "delete") await reviveProjectRevisions(client, scope, d.entityId);
  return { payload: rows[0].payload, cascade };
}

/** `payload` without its location and bookkeeping keys: the immutable
 *  content of an append-only document of `entity` (`outsideContent`). */
const CONTENT_SQL = (entity: string, payload: string) =>
  `(${payload} - ${outsideContent(entity)
    .map((k) => `'${k}'`)
    .join(" - ")})`;

/** True in SQL when a location key differs between two payloads. */
const MOVED_SQL = (a: string, b: string) =>
  `(${LOCATION_KEYS.map((k) => `${a}->'${k}' IS DISTINCT FROM ${b}->'${k}'`).join(" OR ")})`;

/** Stores one append-only document (design 0.2.0 §3.2, ADR-0011): inserted if
 *  absent; the same content again is a no-op (a retried push); other content
 *  under the same id is refused and the stored one stays. The location
 *  (`workspaceId`, `projectId`) is outside the content and may change; the
 *  bookkeeping keys (`NON_CONTENT_KEYS`) keep their first value. Never a
 *  conflict, no base, no last-write-wins. A tombstone stays a tombstone. The
 *  caller holds the workspace's write lock. */
export async function storeAppend(client: PoolClient, scope: Scope, delta: Delta): Promise<ApplyResult> {
  const ws = scope.workspaceId;
  const d = { ...delta, payload: located(delta.payload, ws) };
  const { rows } = await client.query<{ deleted: boolean; same: boolean; moved: boolean }>(
    `SELECT deleted,
            ${CONTENT_SQL(d.entity, "payload")} = ${CONTENT_SQL(d.entity, "$4::jsonb")} AS same,
            ${MOVED_SQL("payload", "$4::jsonb")} AS moved
       FROM documents
      WHERE workspace_id = $1 AND entity = $2 AND entity_id = $3
      FOR UPDATE`,
    [ws, d.entity, d.entityId, d.payload],
  );
  const current = rows[0];
  if (!current) {
    // A shard or result of a project already deleted here arrives as a
    // tombstone, as the cascade would have left it (a device that pushes
    // after the delete). A case revision too, marked `deletedWith` as the
    // cascade marks it (SYNC-11). Audit events stay out.
    const revision = d.entity === "test_case_revision";
    const orphan =
      ((PROJECT_CHILDREN as readonly string[]).includes(d.entity) || revision) &&
      typeof d.payload.projectId === "string" &&
      ((
        await client.query(
          `SELECT 1 FROM documents WHERE workspace_id = $1 AND entity = 'project' AND entity_id = $2 AND deleted`,
          [ws, d.payload.projectId],
        )
      ).rowCount ?? 0) > 0;
    await client.query(
      `INSERT INTO documents
         (workspace_id, entity, entity_id, payload, revision, author, deleted, hlc, author_user_id, updated_at, seq)
       VALUES ($1, $2, $3, $4, 1, $5, $7, $6, $8, now(), nextval('documents_seq'))`,
      [
        ws,
        d.entity,
        d.entityId,
        orphan && revision ? { ...d.payload, deletedWith: d.payload.projectId } : d.payload,
        d.author,
        d.hlc,
        orphan,
        scope.userId,
      ],
    );
    return { accepted: true };
  }
  if (current.deleted) return { accepted: true };
  if (!current.same) {
    return { accepted: false, appendRejected: { entity: d.entity, entityId: d.entityId, reason: "content_changed" } };
  }
  if (current.moved) {
    await client.query(
      // Only the location moves: the stored content and bookkeeping stay.
      `UPDATE documents
          SET payload = (payload ${LOCATION_KEYS.map((k) => `- '${k}'`).join(" ")})
                        || (SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
                              FROM jsonb_each($4::jsonb) WHERE key = ANY($5::text[])),
              updated_at = now(), seq = nextval('documents_seq')
        WHERE workspace_id = $1 AND entity = $2 AND entity_id = $3`,
      [ws, d.entity, d.entityId, d.payload, [...LOCATION_KEYS]],
    );
  }
  return { accepted: true };
}

/** Takes `size` key numbers of a project's series (DAT-01, ADR-0010 rule 4),
 *  starting at the highest of: the next number never handed out, `floor`, and
 *  the highest number of the series this server stores for the project (keys
 *  pushed before blocks existed, or typed by hand). One
 *  `INSERT … ON CONFLICT DO UPDATE … RETURNING` locks the row, so two leases
 *  never overlap. Returns the first number taken, or null when the row belongs
 *  to another workspace. */
export async function leaseRange(
  q: Queryable,
  workspaceId: string,
  r: { projectId: string; kind: KeyKind; prefix: string; floor: number },
  size: number,
): Promise<number | null> {
  // Only keys of the series count: the prefix followed by digits only
  // (a typed `JIRA-48213` must not push every later block that far).
  const stored = r.prefix
    ? await q.query<{ max: string | null }>(
        `SELECT max(CASE WHEN left(k, length($4)) = $4 AND substr(k, length($4) + 1) ~ '^[0-9]{1,15}$'
                         THEN substr(k, length($4) + 1)::bigint END) AS max
           FROM (SELECT ${KEY_SQL} AS k FROM documents
                  WHERE workspace_id = $1 AND entity = ANY($2::text[]) AND payload->>'projectId' = $3) AS keyed`,
        // A DEF key a task card kept from before DEF-01 is still taken.
        [workspaceId, r.kind === "defect" ? [KEY_ENTITY.defect, "planner_card"] : [KEY_ENTITY[r.kind]], r.projectId, r.prefix],
      )
    : null;
  const floor = Math.max(r.floor, Number(stored?.rows[0]?.max ?? 0) + 1);
  const { rows } = await q.query<{ next_value: string }>(
    `INSERT INTO key_blocks (project_id, kind, workspace_id, next_value)
     VALUES ($1, $2, $3, $4::bigint + $5)
     ON CONFLICT (project_id, kind) DO UPDATE
       SET next_value = GREATEST(key_blocks.next_value, $4::bigint) + $5, updated_at = now()
       WHERE key_blocks.workspace_id = $3
     RETURNING next_value`,
    [r.projectId, r.kind, workspaceId, floor, size],
  );
  return rows[0] ? Number(rows[0].next_value) - size : null;
}

/** The capability a lease of keys of `kind` needs: creating that kind of
 *  item (a defect key is leased to create a defect). */
const LEASE_CAPABILITY: Record<KeyKind, Capability> = {
  case: "case.edit",
  requirement: "requirement.edit",
  defect: "defect.create",
  run: "run.execute",
  cycle: "cycle.edit",
};

/** Why a delta may not be stored in the scope's workspace, or null
 *  (ADR-0042 §2): it lives in another workspace, or the role does not allow
 *  it. Any member writes audit events with their changes; in a shared
 *  workspace a pushed one must be the user's own (its chain owner), so
 *  nobody writes a teammate's. */
async function refusal(
  client: PoolClient,
  scope: PushScope,
  d: Delta,
  isNew: boolean,
): Promise<Rejected | null> {
  const elsewhere = await livesElsewhere(client, scope.workspaceId, scope.userId, d.entity, d.entityId);
  if (elsewhere) {
    const member = await membership(client, scope.userId, elsewhere);
    return member
      ? { entity: d.entity, entityId: d.entityId, reason: "moved", workspaceId: elsewhere }
      : { entity: d.entity, entityId: d.entityId, reason: "not_found" };
  }
  const allowed =
    d.entity === "audit_event"
      ? scope.kind === "personal" || d.payload.chainOwner === scope.userId
      : can(scope.role, capabilityFor(d.entity, isNew));
  return allowed ? null : { entity: d.entity, entityId: d.entityId, reason: "forbidden" };
}

export function createSyncRepository(pool: Pool) {
  return {
    /** True if the push touches a planner defect card: an upsert with
     *  `kind: "defect"`, or any change of a card stored as one (all of them
     *  are tombstones since migration 0010, DEF-01). Only a client without
     *  `defects` can still send one; it is refused whole (VERSIONING §6.5). */
    async touchesDefectCards(workspaceId: string, deltas: Delta[]): Promise<boolean> {
      const cards = deltas.filter((d) => d.entity === "planner_card");
      if (cards.some((d) => d.payload.kind === "defect")) return true;
      if (cards.length === 0) return false;
      const { rowCount } = await pool.query(
        `SELECT 1 FROM documents
          WHERE workspace_id = $1 AND entity = 'planner_card' AND entity_id = ANY($2::text[])
            AND payload->>'kind' = 'defect' LIMIT 1`,
        [workspaceId, cards.map((d) => d.entityId)],
      );
      return (rowCount ?? 0) > 0;
    },

    /** Ids of `custom_field` deltas whose stored live field has another
     *  `fieldType`: the type never changes (FLD-01, ADR-0018). */
    async changedFieldTypes(workspaceId: string, deltas: Delta[]): Promise<string[]> {
      const pushed = deltas.filter((d) => d.entity === "custom_field" && d.op === "upsert");
      if (pushed.length === 0) return [];
      const { rows } = await pool.query<{ entity_id: string; field_type: string | null }>(
        `SELECT entity_id, payload->>'fieldType' AS field_type FROM documents
          WHERE workspace_id = $1 AND entity = 'custom_field' AND NOT deleted AND entity_id = ANY($2::text[])`,
        [workspaceId, pushed.map((d) => d.entityId)],
      );
      const stored = new Map(rows.map((r) => [r.entity_id, r.field_type]));
      return pushed
        .filter((d) => stored.has(d.entityId) && stored.get(d.entityId) !== d.payload.fieldType)
        .map((d) => d.entityId);
    },

    /** Applies one delta under the workspace's write lock and a row lock,
     *  following the merge rule in `sync.merge.ts` (base check, then
     *  last-write-wins by HLC). First the server checks where the entity
     *  lives and what the role allows (`refusal`): a refused delta writes
     *  nothing. `merge`: the client is old and its upserts keep the keys it
     *  left out (`storeDoc`); `keep` / `keepData`: keys of features it lacks
     *  (FLD-01, EJE-01). */
    async apply(scope: PushScope, d: Delta, opts: StoreOpts = { merge: false }): Promise<ApplyResult> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(LOCK_WORKSPACE_SQL, [scope.workspaceId]);
        if (isAppendOnly(d.entity)) {
          const refused = await refusal(client, scope, d, false);
          // A pushed event may never extend or fork the server's web chain.
          const result: ApplyResult = refused
            ? { accepted: false, rejected: refused }
            : d.entity === "audit_event" && d.payload.deviceId === WEB_AUDIT_DEVICE
              ? { accepted: false, appendRejected: { entity: d.entity, entityId: d.entityId, reason: "reserved_chain" } }
              : await storeAppend(client, scope, d);
          await client.query("COMMIT");
          return result;
        }
        const { rows } = await client.query(
          `SELECT ${COLS} FROM documents
            WHERE workspace_id = $1 AND entity = $2 AND entity_id = $3
            FOR UPDATE`,
          [scope.workspaceId, d.entity, d.entityId],
        );
        const current = rows[0] ? toDoc(rows[0]) : null;
        const refused = await refusal(client, scope, d, current === null);
        if (refused) {
          await client.query("COMMIT");
          return { accepted: false, rejected: refused };
        }
        const decision = decide(current, d);
        if (decision === "write") {
          const keyConflict = await takenKey(client, scope.workspaceId, d);
          if (keyConflict) {
            await client.query("COMMIT");
            return { accepted: false, keyConflict };
          }
          await storeDoc(client, scope, d, opts);
        }
        await client.query("COMMIT");
        return decision === "conflict" && current ? { accepted: false, current } : { accepted: true };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    /** One page of documents of the given workspaces changed after `since`
     *  (exclusive), oldest first. Reads one extra row to tell the client
     *  whether to ask again (FIX-02). Append-only documents only go to
     *  clients that know the class, the execution entities to clients that
     *  know them (`runs`), the cycle entities to clients that know `cycles`.
     *  Audit events only come from `auditIn`, the workspaces where the user
     *  may read the audit (ADR-0019 decision 5). `legacy` (a client without
     *  `workspaces`, ADR-0042 §3) gets no move tombstones: for it the moved
     *  project lives on. Several workspaces are read under their shared
     *  locks, so no `seq` still in flight is skipped. */
    async since(
      workspaceIds: string[],
      since: number,
      limit = MAX_PULL_LIMIT,
      opts: {
        appendOnly: boolean;
        runs?: boolean;
        cycles?: boolean;
        defects?: boolean;
        legacy?: boolean;
        auditIn?: string[];
        baselines?: boolean;
        blobs?: boolean;
        findings?: boolean;
        library?: boolean;
      } = { appendOnly: false },
    ): Promise<PullPage> {
      if (workspaceIds.length === 0) return { docs: [], hasMore: false };
      const skipped: string[] = [
        ...(opts.appendOnly ? [] : APPEND_ONLY_ENTITIES),
        ...(opts.runs ? [] : EXECUTION_ENTITIES),
        ...(opts.cycles ? [] : CYCLE_ENTITIES),
        ...(opts.defects ? [] : DEFECT_ENTITIES),
        ...(opts.baselines ? [] : BASELINE_ENTITIES),
        ...(opts.findings ? [] : FINDING_ENTITIES),
        ...(opts.blobs ? [] : BLOB_ENTITIES),
        ...(opts.library ? [] : LIBRARY_ENTITIES),
      ];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (workspaceIds.length > 1) await lockWorkspaces(client, workspaceIds, true);
        // A client without `defects` (DEF-01) gets no planner defect card
        // either: since migration 0010 they are the conversion's tombstones,
        // and its read-only kanban keeps the copy it has (VERSIONING §6.5).
        const { rows } = await client.query(
          `SELECT ${COLS}
             FROM documents
            WHERE workspace_id = ANY($1::uuid[]) AND seq > $2 AND entity <> ALL($4::text[])
              AND ($5 OR entity <> 'planner_card' OR payload->>'kind' IS DISTINCT FROM 'defect')
              AND (entity <> 'audit_event' OR workspace_id = ANY($6::uuid[]))
              AND (NOT $7 OR NOT ${MOVE_TOMBSTONE_SQL})
            ORDER BY seq ASC
            LIMIT $3`,
          [
            workspaceIds,
            since,
            limit + 1,
            skipped,
            opts.defects ?? false,
            opts.auditIn ?? workspaceIds,
            opts.legacy ?? false,
          ],
        );
        await client.query("COMMIT");
        return { docs: rows.slice(0, limit).map(toDoc), hasMore: rows.length > limit };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    /** Leases one block of key numbers per request (`leaseRange`). The
     *  device's own next number is the floor, so keys numbered before the
     *  project's first push stay valid. A project that lives in another
     *  workspace is refused, and so is a kind of key the role may not
     *  create. */
    async leaseBlocks(
      scope: PushScope,
      requests: { projectId: string; kind: KeyKind; prefix: string; floor: number; size?: number }[],
    ): Promise<{ blocks: KeyBlock[]; refused: { projectId: string; kind: KeyKind }[] }> {
      const blocks: KeyBlock[] = [];
      const refused: { projectId: string; kind: KeyKind }[] = [];
      for (const r of requests) {
        // Key series are per project id across the whole server
        // (`key_blocks`): a project stored in any other workspace, the user's
        // or not, is refused, as a project of another account was before.
        const elsewhere =
          (
            await pool.query(
              `SELECT 1 FROM documents WHERE entity = 'project' AND entity_id = $1 AND workspace_id <> $2
                 AND NOT ${MOVE_TOMBSTONE_SQL} LIMIT 1`,
              [r.projectId, scope.workspaceId],
            )
          ).rowCount ?? 0;
        // A desktop since DAT-04 asks for what it needs; an older one, for 50.
        const size = r.size ?? KEY_BLOCK_SIZE;
        const start =
          elsewhere || !can(scope.role, LEASE_CAPABILITY[r.kind])
            ? null
            : await leaseRange(pool, scope.workspaceId, r, size);
        if (start === null) {
          refused.push({ projectId: r.projectId, kind: r.kind });
          continue;
        }
        blocks.push({ projectId: r.projectId, kind: r.kind, start, end: start + size - 1 });
      }
      return { blocks, refused };
    },

    /** Clears the content of tombstones older than `days` days (SYNC-06):
     *  what was deleted leaves the server, but the tombstone (entity, id,
     *  deleted, revision, HLC) stays, so a device that pulls it later deletes
     *  its copy and a purged record never comes back. `seq` is not bumped:
     *  devices already have the tombstone and need nothing new. A move's
     *  tombstone keeps its `movedTo`, which is all it holds. Returns how many
     *  were cleared. */
    async compactTombstones(days: number): Promise<number> {
      const { rowCount } = await pool.query(
        `UPDATE documents
            SET payload = CASE WHEN payload ? 'movedTo'
                               THEN jsonb_build_object('movedTo', payload->'movedTo') ELSE '{}'::jsonb END
          WHERE deleted AND payload <> '{}'::jsonb
            AND payload <> jsonb_build_object('movedTo', payload->'movedTo')
            AND updated_at < now() - make_interval(days => $1)`,
        [days],
      );
      return rowCount ?? 0;
    },
  };
}

export type SyncRepository = ReturnType<typeof createSyncRepository>;
