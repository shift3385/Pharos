import type { Pool, PoolClient } from "pg";
import { decide } from "./sync.merge";
import {
  isProvisionalKey,
  KEY_BLOCK_SIZE,
  KEY_ENTITY,
  KEY_FIELD,
  APPEND_ONLY_ENTITIES,
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
 *  rejected because its key is taken (DAT-01). */
export type ApplyResult =
  | { accepted: true }
  | { accepted: false; current: RemoteDoc }
  | { accepted: false; keyConflict: KeyConflict }
  | { accepted: false; appendRejected: AppendRejected };

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

/** The key expression of `documents_key_idx` (migration 0006; `runKey`
 *  since 0008). */
export const KEY_SQL =
  "coalesce(payload->>'scenarioId', payload->>'requirementKey', payload->>'cardKey', payload->>'runKey')";

/** One pull page: documents after the cursor and whether more remain. */
export interface PullPage {
  docs: RemoteDoc[];
  hasMore: boolean;
}

export const COLS = "entity, entity_id, payload, revision, author, deleted, hlc, seq";

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

/** Serializes one user's sync writes until the transaction ends. `seq` comes
 *  from `nextval()` inside the transaction, so without this a transaction that
 *  took a lower seq could commit after a client already pulled past a higher
 *  one, and the client would never see it. With one writer per user at a
 *  time, a user's seqs become visible in order. */
export const LOCK_USER_SQL = "SELECT pg_advisory_xact_lock(hashtext($1))";

/** Deleting a project deletes its plans, cases, requirements and planner
 *  cards in the same transaction (FIX-05, ADR-0020), whichever client sent
 *  it. Each child gets a tombstone with a new `seq`, so every device pulls it;
 *  a device with a pending edit of that child sees a conflict, not a loss.
 *  A child's HLC never goes backwards (a newer child edit keeps its HLC), so
 *  a stale web upsert cannot win last-write-wins against the tombstone. */
async function cascadeProjectDelete(client: PoolClient, userId: string, d: Delta): Promise<Record<string, number>> {
  const { rows } = await client.query<{ entity: string }>(
    `UPDATE documents
        SET deleted = true, revision = revision + 1, hlc = GREATEST(hlc, $3), author = $4,
            updated_at = now(), seq = nextval('documents_seq')
      WHERE user_id = $1 AND entity = ANY($5::text[]) AND NOT deleted
        AND payload->>'projectId' = $2
      RETURNING entity`,
    [userId, d.entityId, d.hlc, d.author, [...PROJECT_CHILDREN]],
  );
  const counted = PROJECT_CHILDREN.filter((e) => CASCADE_KEY[e]);
  const counts: Record<string, number> = Object.fromEntries(counted.map((e) => [CASCADE_KEY[e], 0]));
  for (const r of rows) {
    const key = CASCADE_KEY[r.entity as (typeof PROJECT_CHILDREN)[number]];
    if (key) counts[key]++;
  }
  return counts;
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
  run: "runs",
  run_item: "run_items",
  unlinked_mapping: "unlinked_mappings",
};

/** The live document of the same project that already uses the key of an
 *  upsert (DAT-01), as a key conflict; null when the key is free, empty or
 *  provisional. Runs under the user's write lock, so two pushes of the same key
 *  cannot both pass. */
export async function takenKey(client: PoolClient, userId: string, d: Delta): Promise<KeyConflict | null> {
  const field = KEY_FIELD[d.entity];
  const key = field ? d.payload[field] : undefined;
  if (d.op !== "upsert" || typeof key !== "string" || !key || isProvisionalKey(key)) return null;
  const { rows } = await client.query<{ entity_id: string }>(
    `SELECT entity_id FROM documents
      WHERE user_id = $1 AND entity = $2 AND NOT deleted
        AND payload->>'projectId' = $3 AND ${KEY_SQL} = $4 AND entity_id <> $5
      LIMIT 1`,
    [userId, d.entity, String(d.payload.projectId ?? ""), key, d.entityId],
  );
  return rows[0] ? { entity: d.entity, entityId: d.entityId, key, takenBy: rows[0].entity_id } : null;
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
 *  keys to the entity (`FEATURE_KEYS`): those keys ($9), when it left them
 *  out, keep the stored value. Everything else is its payload as is. */
const KEPT_PAYLOAD_SQL = `CASE WHEN documents.deleted OR EXCLUDED.deleted THEN EXCLUDED.payload
       ELSE EXCLUDED.payload || coalesce(
         (SELECT jsonb_object_agg(k.key, k.value) FROM jsonb_each(documents.payload) AS k
           WHERE k.key = ANY($9::text[]) AND NOT (EXCLUDED.payload ? k.key)),
         '{}'::jsonb)
     END`;

/** Stores a delta as the user's latest version of the entity (with a new
 *  `seq`) and cascades a project delete to its children. The caller holds the
 *  user's write lock and has already decided that the delta wins. `merge`:
 *  keep the keys the delta left out (only for old clients, above); `keep`:
 *  keep just these keys when left out (`KEPT_PAYLOAD_SQL`). Returns the
 *  payload stored and, for a project delete, how many children it removed
 *  (the web's audit event reads both, AUD-01b). */
export async function storeDoc(
  client: PoolClient,
  userId: string,
  d: Delta,
  opts: { merge: boolean; keep?: readonly string[] } = { merge: false },
): Promise<{ payload: Record<string, unknown>; cascade: Record<string, number> | null }> {
  const keep = opts.keep ?? [];
  const payloadSql = opts.merge ? MERGED_PAYLOAD_SQL : keep.length ? KEPT_PAYLOAD_SQL : "EXCLUDED.payload";
  const params: unknown[] = [userId, d.entity, d.entityId, d.payload, d.revision, d.author, d.op === "delete", d.hlc];
  if (!opts.merge && keep.length) params.push([...keep]);
  const { rows } = await client.query<{ payload: Record<string, unknown> }>(
    `INSERT INTO documents
       (user_id, entity, entity_id, payload, revision, author, deleted, hlc, updated_at, seq)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), nextval('documents_seq'))
     ON CONFLICT (user_id, entity, entity_id) DO UPDATE
       SET payload = ${payloadSql},

           revision = EXCLUDED.revision,
           author = EXCLUDED.author,
           deleted = EXCLUDED.deleted,
           hlc = EXCLUDED.hlc,
           updated_at = now(),
           seq = nextval('documents_seq')
     RETURNING payload`,
    params,
  );
  const cascade = d.entity === "project" && d.op === "delete" ? await cascadeProjectDelete(client, userId, d) : null;
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
 *  caller holds the user's write lock. */
export async function storeAppend(client: PoolClient, userId: string, d: Delta): Promise<ApplyResult> {
  const { rows } = await client.query<{ deleted: boolean; same: boolean; moved: boolean }>(
    `SELECT deleted,
            ${CONTENT_SQL(d.entity, "payload")} = ${CONTENT_SQL(d.entity, "$4::jsonb")} AS same,
            ${MOVED_SQL("payload", "$4::jsonb")} AS moved
       FROM documents
      WHERE user_id = $1 AND entity = $2 AND entity_id = $3
      FOR UPDATE`,
    [userId, d.entity, d.entityId, d.payload],
  );
  const current = rows[0];
  if (!current) {
    await client.query(
      `INSERT INTO documents
         (user_id, entity, entity_id, payload, revision, author, deleted, hlc, updated_at, seq)
       VALUES ($1, $2, $3, $4, 1, $5, false, $6, now(), nextval('documents_seq'))`,
      [userId, d.entity, d.entityId, d.payload, d.author, d.hlc],
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
        WHERE user_id = $1 AND entity = $2 AND entity_id = $3`,
      [userId, d.entity, d.entityId, d.payload, [...LOCATION_KEYS]],
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
 *  to another account. */
export async function leaseRange(
  q: Queryable,
  userId: string,
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
                  WHERE user_id = $1 AND entity = $2 AND payload->>'projectId' = $3) AS keyed`,
        [userId, KEY_ENTITY[r.kind], r.projectId, r.prefix],
      )
    : null;
  const floor = Math.max(r.floor, Number(stored?.rows[0]?.max ?? 0) + 1);
  const { rows } = await q.query<{ next_value: string }>(
    `INSERT INTO key_blocks (project_id, kind, owner_id, next_value)
     VALUES ($1, $2, $3, $4::bigint + $5)
     ON CONFLICT (project_id, kind) DO UPDATE
       SET next_value = GREATEST(key_blocks.next_value, $4::bigint) + $5, updated_at = now()
       WHERE key_blocks.owner_id = $3
     RETURNING next_value`,
    [r.projectId, r.kind, userId, floor, size],
  );
  return rows[0] ? Number(rows[0].next_value) - size : null;
}

export function createSyncRepository(pool: Pool) {
  return {
    /** Applies one delta under a row lock, following the merge rule in
     *  `sync.merge.ts` (base check, then last-write-wins by HLC). `merge`: the
     *  client is old and its upserts keep the keys it left out (`storeDoc`). */
    async apply(
      userId: string,
      d: Delta,
      opts: { merge: boolean; keep?: readonly string[] } = { merge: false },
    ): Promise<ApplyResult> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(LOCK_USER_SQL, [userId]);
        if (isAppendOnly(d.entity)) {
          // A pushed event may never extend or fork the server's web chain.
          const result: ApplyResult =
            d.entity === "audit_event" && d.payload.deviceId === WEB_AUDIT_DEVICE
              ? { accepted: false, appendRejected: { entity: d.entity, entityId: d.entityId, reason: "reserved_chain" } }
              : await storeAppend(client, userId, d);
          await client.query("COMMIT");
          return result;
        }
        const { rows } = await client.query(
          `SELECT ${COLS} FROM documents
            WHERE user_id = $1 AND entity = $2 AND entity_id = $3
            FOR UPDATE`,
          [userId, d.entity, d.entityId],
        );
        const current = rows[0] ? toDoc(rows[0]) : null;
        const decision = decide(current, d);
        if (decision === "write") {
          const keyConflict = await takenKey(client, userId, d);
          if (keyConflict) {
            await client.query("COMMIT");
            return { accepted: false, keyConflict };
          }
          await storeDoc(client, userId, d, opts);
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

    /** One page of documents changed after `since` (exclusive), oldest first.
     *  Reads one extra row to tell the client whether to ask again (FIX-02).
     *  Append-only documents only go to clients that know the class, and the
     *  execution entities to clients that know them (`runs`). */
    async since(
      userId: string,
      since: number,
      limit = MAX_PULL_LIMIT,
      opts: { appendOnly: boolean; runs?: boolean } = { appendOnly: false },
    ): Promise<PullPage> {
      const skipped: string[] = [
        ...(opts.appendOnly ? [] : APPEND_ONLY_ENTITIES),
        ...(opts.runs ? [] : EXECUTION_ENTITIES),
      ];
      const { rows } = await pool.query(
        `SELECT ${COLS}
           FROM documents
          WHERE user_id = $1 AND seq > $2 AND entity <> ALL($4::text[])
          ORDER BY seq ASC
          LIMIT $3`,
        [userId, since, limit + 1, skipped],
      );
      return { docs: rows.slice(0, limit).map(toDoc), hasMore: rows.length > limit };
    },

    /** Leases one block of key numbers per request (`leaseRange`). The
     *  device's own next number is the floor, so keys numbered before the
     *  project's first push stay valid. A project another account owns is
     *  refused. */
    async leaseBlocks(
      userId: string,
      requests: { projectId: string; kind: KeyKind; prefix: string; floor: number }[],
    ): Promise<{ blocks: KeyBlock[]; refused: { projectId: string; kind: KeyKind }[] }> {
      const blocks: KeyBlock[] = [];
      const refused: { projectId: string; kind: KeyKind }[] = [];
      for (const r of requests) {
        const foreign = await pool.query(
          `SELECT 1 FROM documents WHERE entity = 'project' AND entity_id = $1 AND user_id <> $2 LIMIT 1`,
          [r.projectId, userId],
        );
        const start = foreign.rowCount ? null : await leaseRange(pool, userId, r, KEY_BLOCK_SIZE);
        if (start === null) {
          refused.push({ projectId: r.projectId, kind: r.kind });
          continue;
        }
        blocks.push({ projectId: r.projectId, kind: r.kind, start, end: start + KEY_BLOCK_SIZE - 1 });
      }
      return { blocks, refused };
    },

    /** Clears the content of tombstones older than `days` days (SYNC-06):
     *  what was deleted leaves the server, but the tombstone (entity, id,
     *  deleted, revision, HLC) stays, so a device that pulls it later deletes
     *  its copy and a purged record never comes back. `seq` is not bumped:
     *  devices already have the tombstone and need nothing new. Returns how
     *  many were cleared. */
    async compactTombstones(days: number): Promise<number> {
      const { rowCount } = await pool.query(
        `UPDATE documents SET payload = '{}'::jsonb
          WHERE deleted AND payload <> '{}'::jsonb
            AND updated_at < now() - make_interval(days => $1)`,
        [days],
      );
      return rowCount ?? 0;
    },
  };
}

export type SyncRepository = ReturnType<typeof createSyncRepository>;
