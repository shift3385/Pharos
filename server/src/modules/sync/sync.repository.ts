import type { Pool } from "pg";
import { decide } from "./sync.merge";
import type { Delta } from "./sync.schemas";

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

export function createSyncRepository(pool: Pool) {
  return {
    /** Applies one delta under a row lock, following the merge rule in
     *  `sync.merge.ts` (base check, then last-write-wins by HLC). */
    async apply(userId: string, d: Delta): Promise<ApplyResult> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
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

    /** Documents changed after `since` (exclusive), oldest first. */
    async since(userId: string, since: number, limit = 500): Promise<RemoteDoc[]> {
      const { rows } = await pool.query(
        `SELECT ${COLS}
           FROM documents
          WHERE user_id = $1 AND seq > $2
          ORDER BY seq ASC
          LIMIT $3`,
        [userId, since, limit],
      );
      return rows.map(toDoc);
    },
  };
}

export type SyncRepository = ReturnType<typeof createSyncRepository>;
