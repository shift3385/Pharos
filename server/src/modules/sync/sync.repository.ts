import type { Pool, PoolClient } from "pg";
import { decide } from "./sync.merge";
import { MAX_PULL_LIMIT, PROJECT_CHILDREN, type Delta } from "./sync.schemas";

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

/** Outcome of one pushed delta: accepted, or rejected as a conflict together
 *  with the version the server keeps (sent back so the client can show it). */
export type ApplyResult = { accepted: true } | { accepted: false; current: RemoteDoc };

/** One pull page: documents after the cursor and whether more remain. */
export interface PullPage {
  docs: RemoteDoc[];
  hasMore: boolean;
}

const COLS = "entity, entity_id, payload, revision, author, deleted, hlc, seq";

function toDoc(r: Record<string, unknown>): RemoteDoc {
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
async function cascadeProjectDelete(client: PoolClient, userId: string, d: Delta): Promise<void> {
  await client.query(
    `UPDATE documents
        SET deleted = true, revision = revision + 1, hlc = GREATEST(hlc, $3), author = $4,
            updated_at = now(), seq = nextval('documents_seq')
      WHERE user_id = $1 AND entity = ANY($5::text[]) AND NOT deleted
        AND payload->>'projectId' = $2`,
    [userId, d.entityId, d.hlc, d.author, [...PROJECT_CHILDREN]],
  );
}

export function createSyncRepository(pool: Pool) {
  return {
    /** Applies one delta under a row lock, following the merge rule in
     *  `sync.merge.ts` (base check, then last-write-wins by HLC). */
    async apply(userId: string, d: Delta): Promise<ApplyResult> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(LOCK_USER_SQL, [userId]);
        const { rows } = await client.query(
          `SELECT ${COLS} FROM documents
            WHERE user_id = $1 AND entity = $2 AND entity_id = $3
            FOR UPDATE`,
          [userId, d.entity, d.entityId],
        );
        const current = rows[0] ? toDoc(rows[0]) : null;
        const decision = decide(current, d);
        if (decision === "write") {
          await client.query(
            `INSERT INTO documents
               (user_id, entity, entity_id, payload, revision, author, deleted, hlc, updated_at, seq)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), nextval('documents_seq'))
             ON CONFLICT (user_id, entity, entity_id) DO UPDATE
               SET payload = EXCLUDED.payload,
                   revision = EXCLUDED.revision,
                   author = EXCLUDED.author,
                   deleted = EXCLUDED.deleted,
                   hlc = EXCLUDED.hlc,
                   updated_at = now(),
                   seq = nextval('documents_seq')`,
            [userId, d.entity, d.entityId, d.payload, d.revision, d.author, d.op === "delete", d.hlc],
          );
          if (d.entity === "project" && d.op === "delete") await cascadeProjectDelete(client, userId, d);
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
     *  Reads one extra row to tell the client whether to ask again (FIX-02). */
    async since(userId: string, since: number, limit = MAX_PULL_LIMIT): Promise<PullPage> {
      const { rows } = await pool.query(
        `SELECT ${COLS}
           FROM documents
          WHERE user_id = $1 AND seq > $2
          ORDER BY seq ASC
          LIMIT $3`,
        [userId, since, limit + 1],
      );
      return { docs: rows.slice(0, limit).map(toDoc), hasMore: rows.length > limit };
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
