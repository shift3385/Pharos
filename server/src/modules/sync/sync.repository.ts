import type { Pool } from "pg";
import type { Delta } from "./sync.schemas";

export interface RemoteDoc {
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  revision: number;
  author: string;
  deleted: boolean;
  seq: number;
}

export function createSyncRepository(pool: Pool) {
  return {
    /** Upserts one delta with per-entity last-write-wins by revision. Returns
     *  false when an older revision was rejected (server keeps its version). */
    async apply(userId: string, d: Delta): Promise<void> {
      await pool.query(
        `INSERT INTO documents
           (user_id, entity, entity_id, payload, revision, author, deleted, updated_at, seq)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), nextval('documents_seq'))
         ON CONFLICT (user_id, entity, entity_id) DO UPDATE
           SET payload = EXCLUDED.payload,
               revision = EXCLUDED.revision,
               author = EXCLUDED.author,
               deleted = EXCLUDED.deleted,
               updated_at = now(),
               seq = nextval('documents_seq')
         WHERE EXCLUDED.revision >= documents.revision`,
        [userId, d.entity, d.entityId, d.payload, d.revision, d.author, d.op === "delete"],
      );
    },

    /** Documents changed after `since` (exclusive), oldest first. */
    async since(userId: string, since: number, limit = 500): Promise<RemoteDoc[]> {
      const { rows } = await pool.query(
        `SELECT entity, entity_id, payload, revision, author, deleted, seq
           FROM documents
          WHERE user_id = $1 AND seq > $2
          ORDER BY seq ASC
          LIMIT $3`,
        [userId, since, limit],
      );
      return rows.map((r) => ({
        entity: r.entity,
        entityId: r.entity_id,
        payload: r.payload,
        revision: r.revision,
        author: r.author,
        deleted: r.deleted,
        seq: Number(r.seq),
      }));
    },
  };
}

export type SyncRepository = ReturnType<typeof createSyncRepository>;
