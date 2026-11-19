import type { Pool, PoolClient } from "pg";
import { AppError } from "../auth/errors.js";
import { diff, location } from "../audit/audit.diff.js";
import { appendWebEvent, type AuditAction } from "../audit/audit.store.js";
import type { ServerClock } from "../sync/sync.hlc.js";
import {
  COLS,
  KEY_SQL,
  leaseRange,
  lockWorkspaces,
  MOVE_TOMBSTONE_SQL,
  storeAppend,
  storeDoc,
  takenKey,
  toDoc,
  type RemoteDoc,
} from "../sync/sync.repository.js";
import type { KeyKind } from "../sync/sync.schemas.js";
import { WorkspaceErrors } from "../workspaces/access.js";
import { memberships, type Membership } from "../workspaces/members.js";
import { can, capabilityFor, type Capability } from "../workspaces/roles.js";

/** Domain writes of the web (BASE-10, ADR-0004) go to the same document
 *  store the devices sync with: every write is a document with a new
 *  revision, an HLC stamped by the server and a new `seq`, so the desktops pull
 *  it like any other change. The web sees the user's workspaces together
 *  (SYNC-07, ADR-0042 §4): reads span all of them; a write goes to the
 *  workspace of its project (a new project, to the personal one) and needs
 *  the role there (`capabilityFor`, else 403 `forbidden`). A transaction
 *  holds the write locks of the user's workspaces (the same ones
 *  `/sync/push` takes), so a web write and a device push never interleave. */
export interface DomainTx {
  /** The stored version of an entity (live or tombstone), locked. */
  get(entity: string, id: string): Promise<RemoteDoc | null>;
  /** The workspace an entity is stored in, among the user's, or null (move
   *  tombstones skipped). The approver check asks it rather than trust the
   *  payload's `workspaceId`, which a document without the key, or one not
   *  stored yet, leaves as "local" (CAS-02, PLN-08). */
  workspaceOf(entity: string, id: string): Promise<string | null>;
  /** Live documents of an entity, optionally of one project; with
   *  `withDeleted`, its tombstones too; with `where`, only those whose
   *  payload text fields equal the given values (one run's items or
   *  results, EJE-06). */
  list(
    entity: string,
    projectId?: string,
    opts?: { withDeleted?: boolean; where?: Record<string, string> },
  ): Promise<RemoteDoc[]>;
  /** Whether a key of the project is used by another document of the entity:
   *  "live", "deleted" (a key is never reused, ADR-0010) or null. */
  keyUse(entity: string, projectId: string, key: string, exceptId?: string): Promise<"live" | "deleted" | null>;
  /** The next number of a project's key series, never handed out before. */
  nextNumber(projectId: string, kind: KeyKind, prefix: string): Promise<number>;
  /** Stores the next version of an entity (or its tombstone) and returns it,
   *  with its audit event in the same transaction (AUD-01b): a create, an
   *  update or a delete with the field diff, and none for an update that
   *  changed nothing. `audit: "folded"`: a row of a bulk operation that
   *  writes one summary event instead (`audit`). A project delete is one
   *  event with the cascade counts; its children get none. `summary`: the
   *  event's summary for a change that carries its own (a cycle's clone or
   *  delete, CYC-01), as the desktop's `Change::summary`. */
  put(
    entity: string,
    id: string,
    payload: Record<string, unknown>,
    current: RemoteDoc | null,
    deleted?: boolean,
    opts?: { audit?: "event" | "folded"; summary?: Record<string, unknown> },
  ): Promise<RemoteDoc>;
  /** An audit event with no write of its own: the summary of a bulk
   *  operation (an import, with its counts), as on the desktop
   *  (`journal::record_event`). */
  audit(
    action: AuditAction,
    entity: string,
    id: string,
    summary: Record<string, unknown>,
    changes?: Record<string, unknown>,
  ): Promise<void>;
  /** Stores an append-only document (a case revision, DAT-02) if absent. */
  append(entity: string, id: string, payload: Record<string, unknown>): Promise<void>;
  /** A new HLC from the server's clock, for a document that carries its own
   *  (a result, EJE-06), as the desktop's `oplog::next_hlc`. */
  stamp(): string;
}

/** Reads without locks (the execution derivation, step 10): one consistent
 *  snapshot, no write lock, no `FOR UPDATE`, so a long read never blocks a
 *  device push or a web write. */
export interface DomainReader {
  /** Live documents of an entity (with `withDeleted`, tombstones too) of the
   *  given projects; `project` documents are matched by their own id. */
  list(entity: string, projectIds: string[], opts?: { withDeleted?: boolean }): Promise<RemoteDoc[]>;
  /** The user's live projects, or those of `ids` that are theirs. */
  projects(ids?: string[] | null): Promise<RemoteDoc[]>;
}

/** The state an event diffs: the payload plus whether it is deleted, as the
 *  desktop's `journal::snapshot`. */
const snapshot = (payload: Record<string, unknown>, deleted: boolean) => ({ ...payload, deleted });

/** 409 with the version the server keeps: the item changed since the client
 *  read it (FIX-04). The client keeps its edit and shows the newer version. */
export function staleWrite(current: RemoteDoc): AppError {
  return new AppError(409, "stale_write", "This item was changed elsewhere since you opened it.", {
    current: current.payload,
  });
}

/** Documents of the user's workspaces, without the tombstones a move left
 *  in its origin: the entity lives on in the destination (ADR-0042 §5). */
const VISIBLE = `workspace_id = ANY($1::uuid[]) AND NOT ${MOVE_TOMBSTONE_SQL}`;

export function createDomainStore(pool: Pool, clock: ServerClock) {
  function txOf(client: PoolClient, userId: string, members: Membership[], readOnly = false): DomainTx {
    // A read-only transaction takes no row locks.
    const lock = readOnly ? "" : " FOR UPDATE";
    const ws = members.map((m) => m.workspaceId);
    const personal = members.find((m) => m.kind === "personal")?.workspaceId ?? ws[0];

    /** Where an entity lives among the user's workspaces, or null. */
    async function home(entity: string, id: string): Promise<string | null> {
      const { rows } = await client.query<{ workspace_id: string }>(
        `SELECT workspace_id FROM documents WHERE ${VISIBLE} AND entity = $2 AND entity_id = $3 LIMIT 1`,
        [ws, entity, id],
      );
      return rows[0]?.workspace_id ?? null;
    }

    /** The workspace a write of the entity goes to: where it lives; for a
     *  new one, where its project lives; for a new project (or anything
     *  without one), the personal workspace. */
    async function target(entity: string, id: string, payload: Record<string, unknown>): Promise<string> {
      const found = await home(entity, id);
      if (found) return found;
      if (entity !== "project" && typeof payload.projectId === "string") {
        const project = await home("project", payload.projectId);
        if (project) return project;
      }
      return personal;
    }

    /** The user's role in `workspaceId` must allow `cap` (403 otherwise). */
    function check(workspaceId: string, cap: Capability): void {
      const m = members.find((x) => x.workspaceId === workspaceId);
      if (!m || !can(m.role, cap)) throw WorkspaceErrors.forbidden(cap);
    }

    return {
      async get(entity, id) {
        const { rows } = await client.query(
          `SELECT ${COLS} FROM documents WHERE ${VISIBLE} AND entity = $2 AND entity_id = $3 LIMIT 1${lock}`,
          [ws, entity, id],
        );
        return rows[0] ? toDoc(rows[0]) : null;
      },
      workspaceOf: home,
      async list(entity, projectId, opts) {
        const where = Object.entries(opts?.where ?? {});
        // Field names are the caller's own constants; only the values are
        // parameters.
        for (const [k] of where) if (!/^[A-Za-z]+$/.test(k)) throw new Error(`bad field: ${k}`);
        const extra = where.map(([k], i) => ` AND payload->>'${k}' = $${5 + i}`).join("");
        const { rows } = await client.query(
          `SELECT ${COLS} FROM documents
            WHERE ${VISIBLE} AND entity = $2 AND ($4 OR NOT deleted)
              AND ($3::text IS NULL OR payload->>'projectId' = $3)${extra}`,
          [ws, entity, projectId ?? null, opts?.withDeleted === true, ...where.map(([, v]) => v)],
        );
        return rows.map(toDoc);
      },
      async keyUse(entity, projectId, key, exceptId = "") {
        const { rows } = await client.query<{ deleted: boolean }>(
          `SELECT deleted FROM documents
            WHERE ${VISIBLE} AND entity = $2 AND payload->>'projectId' = $3
              AND ${KEY_SQL} = $4 AND entity_id <> $5
            ORDER BY deleted LIMIT 1`,
          [ws, entity, projectId, key, exceptId],
        );
        if (!rows[0]) return null;
        return rows[0].deleted ? "deleted" : "live";
      },
      async nextNumber(projectId, kind, prefix) {
        const where = await home("project", projectId);
        const n = where ? await leaseRange(client, where, { projectId, kind, prefix, floor: 1 }, 1) : null;
        if (n === null) throw new AppError(404, "not_found", "Project not found.");
        return n;
      },
      async put(entity, id, payload, current, deleted = false, opts = {}) {
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
        const into = await target(entity, id, payload);
        check(into, capabilityFor(entity, current === null));
        // Safety net under the lock: the rules already checked the key.
        if (await takenKey(client, into, delta)) {
          throw new AppError(409, "key_taken", "Another item of the project already uses this key.");
        }
        const stored = await storeDoc(client, { workspaceId: into, userId }, delta);
        if (opts.audit !== "folded") {
          const before = current ? snapshot(current.payload, current.deleted) : null;
          const after = snapshot(stored.payload, deleted);
          const action: AuditAction = deleted ? "delete" : current ? "update" : "create";
          const changes = action === "create" ? diff(null, after) : action === "delete" ? diff(before, null) : diff(before, after);
          const summary = stored.cascade ? { cascade: stored.cascade } : (opts.summary ?? null);
          if (action !== "update" || Object.keys(changes).length > 0 || summary) {
            await appendWebEvent(
              client,
              clock,
              {
                userId,
                workspaceId: into,
                action,
                entity,
                entityId: id,
                ...location(entity, id, before, after),
                changes,
                summary,
              },
              delta.hlc,
            );
          }
        }
        return { ...delta, payload: stored.payload, deleted, seq: 0 };
      },
      async append(entity, id, payload) {
        const into = await target(entity, id, payload);
        check(into, capabilityFor(entity, true));
        const res = await storeAppend(
          client,
          { workspaceId: into, userId },
          {
            entity: entity as never,
            entityId: id,
            op: "append",
            payload,
            revision: 1,
            author: userId,
            hlc: String(payload.hlc ?? ""),
          },
        );
        if (!res.accepted)
          throw new AppError(
            409,
            "append_rejected",
            "This revision already exists with other content.",
          );
      },
      stamp() {
        return clock.stamp();
      },
      async audit(action, entity, id, summary, changes = {}) {
        const into = await target(entity, id, {});
        const { rows } = await client.query(
          `SELECT ${COLS} FROM documents WHERE workspace_id = $1 AND entity = $2 AND entity_id = $3`,
          [into, entity, id],
        );
        const snap = rows[0] ? snapshot(toDoc(rows[0]).payload, toDoc(rows[0]).deleted) : null;
        await appendWebEvent(client, clock, {
          userId,
          workspaceId: into,
          action,
          entity,
          entityId: id,
          ...location(entity, id, snap, null),
          changes,
          summary,
        });
      },
    };
  }

  return {
    /** Runs `fn` with a whole `DomainTx` in a read-only, repeatable-read
     *  transaction, without write locks: a read never waits for (or holds
     *  up) a push or a web write (the runs API, EJE-06). A write in it
     *  fails. `read` is the multi-project reader of the derivation. */
    async readTx<T>(userId: string, fn: (tx: DomainTx) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const result = await fn(txOf(client, userId, await memberships(client, userId), true));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    /** Runs `fn` in a read-only, repeatable-read transaction with no lock. */
    async read<T>(userId: string, fn: (r: DomainReader) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const ws = (await memberships(client, userId)).map((m) => m.workspaceId);
        const reader: DomainReader = {
          async list(entity, projectIds, opts) {
            const { rows } = await client.query(
              `SELECT ${COLS} FROM documents
                WHERE ${VISIBLE} AND entity = $2 AND ($4 OR NOT deleted)
                  AND payload->>'projectId' = ANY($3::text[])`,
              [ws, entity, projectIds, opts?.withDeleted === true],
            );
            return rows.map(toDoc);
          },
          async projects(ids) {
            const { rows } = await client.query(
              `SELECT ${COLS} FROM documents
                WHERE ${VISIBLE} AND entity = 'project' AND NOT deleted
                  AND ($2::text[] IS NULL OR entity_id = ANY($2::text[]))`,
              [ws, ids ?? null],
            );
            return rows.map(toDoc);
          },
        };
        const result = await fn(reader);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    /** Runs `fn` in one transaction under the write locks of the user's
     *  workspaces. */
    async tx<T>(userId: string, fn: (tx: DomainTx) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const members = await memberships(client, userId);
        await lockWorkspaces(
          client,
          members.map((m) => m.workspaceId),
        );
        const result = await fn(txOf(client, userId, members));
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
