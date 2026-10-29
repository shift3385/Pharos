import type { Pool, PoolClient } from "pg";
import { AppError } from "../auth/errors";
import type { ServerClock } from "../sync/sync.hlc";
import {
  COLS,
  KEY_SQL,
  leaseRange,
  LOCK_USER_SQL,
  storeDoc,
  takenKey,
  toDoc,
  type RemoteDoc,
} from "../sync/sync.repository";
import type { KeyKind } from "../sync/sync.schemas";

/** Domain writes of the web (BASE-10, ADR-0004) go to the same per-user
 *  document store the devices sync with: every write is a document with a new
 *  revision, an HLC stamped by the server and a new `seq`, so the desktops pull
 *  it like any other change. A transaction holds the user's write lock (the
 *  same one `/sync/push` takes), so a web write and a device push never
 *  interleave. */
export interface DomainTx {
  /** The stored version of an entity (live or tombstone), locked. */
  get(entity: string, id: string): Promise<RemoteDoc | null>;
  /** Live documents of an entity, optionally of one project. */
  list(entity: string, projectId?: string): Promise<RemoteDoc[]>;
  /** Whether a key of the project is used by another document of the entity:
   *  "live", "deleted" (a key is never reused, ADR-0010) or null. */
  keyUse(entity: string, projectId: string, key: string, exceptId?: string): Promise<"live" | "deleted" | null>;
  /** The next number of a project's key series, never handed out before. */
  nextNumber(projectId: string, kind: KeyKind, prefix: string): Promise<number>;
  /** Stores the next version of an entity (or its tombstone) and returns it. */
  put(entity: string, id: string, payload: Record<string, unknown>, current: RemoteDoc | null, deleted?: boolean): Promise<RemoteDoc>;
}

/** 409 with the version the server keeps: the item changed since the client
 *  read it (FIX-04). The client keeps its edit and shows the newer version. */
export function staleWrite(current: RemoteDoc): AppError {
  return new AppError(409, "stale_write", "This item was changed elsewhere since you opened it.", {
    current: current.deleted ? null : current.payload,
  });
}

export function createDomainStore(pool: Pool, clock: ServerClock) {
  function txOf(client: PoolClient, userId: string): DomainTx {
    return {
      async get(entity, id) {
        const { rows } = await client.query(
          `SELECT ${COLS} FROM documents WHERE user_id = $1 AND entity = $2 AND entity_id = $3 FOR UPDATE`,
          [userId, entity, id],
        );
        return rows[0] ? toDoc(rows[0]) : null;
      },
      async list(entity, projectId) {
        const { rows } = await client.query(
          `SELECT ${COLS} FROM documents
            WHERE user_id = $1 AND entity = $2 AND NOT deleted
              AND ($3::text IS NULL OR payload->>'projectId' = $3)`,
          [userId, entity, projectId ?? null],
        );
        return rows.map(toDoc);
      },
      async keyUse(entity, projectId, key, exceptId = "") {
        const { rows } = await client.query<{ deleted: boolean }>(
          `SELECT deleted FROM documents
            WHERE user_id = $1 AND entity = $2 AND payload->>'projectId' = $3
              AND ${KEY_SQL} = $4 AND entity_id <> $5
            ORDER BY deleted LIMIT 1`,
          [userId, entity, projectId, key, exceptId],
        );
        if (!rows[0]) return null;
        return rows[0].deleted ? "deleted" : "live";
      },
      async nextNumber(projectId, kind, prefix) {
        const n = await leaseRange(client, userId, { projectId, kind, prefix, floor: 1 }, 1);
        if (n === null) throw new AppError(404, "not_found", "Project not found.");
        return n;
      },
      async put(entity, id, payload, current, deleted = false) {
        const revision = (current?.revision ?? 0) + 1;
        const delta = {
          entity: entity as never,
          entityId: id,
          op: deleted ? ("delete" as const) : ("upsert" as const),
          payload: { ...payload, revision },
          revision,
          author: userId,
          hlc: clock.stamp(current?.hlc),
        };
        // Safety net under the lock: the rules already checked the key.
        if (await takenKey(client, userId, delta)) {
          throw new AppError(409, "key_taken", "Another item of the project already uses this key.");
        }
        await storeDoc(client, userId, delta);
        return { ...delta, deleted, seq: 0 };
      },
    };
  }

  return {
    /** Runs `fn` in one transaction under the user's write lock. */
    async tx<T>(userId: string, fn: (tx: DomainTx) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(LOCK_USER_SQL, [userId]);
        const result = await fn(txOf(client, userId));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export type DomainStore = ReturnType<typeof createDomainStore>;
