import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ServerClock } from "../sync/sync.hlc";
import { storeAppend, WEB_AUDIT_DEVICE } from "../sync/sync.repository";
import { hashOf, sha256Hex, type AuditEvent } from "./audit.chain";

// The web's audit chain (AUD-01b, ADR-0015). Every domain write of the web
// leaves one `audit_event` in the user's document store, in the same
// transaction, linked into a chain of its own: device "web", chain workspace
// "web", owner the user. Desktops with `append-only` pull those events
// unchanged and verify them with `audit::verify_chain(conn, "web", "web",
// user)`. The head of each chain lives in `audit_chain_heads` (migration
// 0007), read and moved under the user's write lock.

/** The device and chain workspace of the web's chain. No desktop has this
 *  device id (theirs are UUIDs), and `/sync/push` refuses an event that
 *  claims it, so only the server writes this chain. */
export const WEB_DEVICE = WEB_AUDIT_DEVICE;
export const WEB_CHAIN_WORKSPACE = "web";

export type AuditAction = "create" | "update" | "delete" | "import";

/** A new web event, before it is linked. */
export interface NewWebEvent {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  projectId: string | null;
  entityKey: string | null;
  /** `{ field: [before, after] }`. */
  changes: Record<string, unknown>;
  summary: unknown;
}

/** JSON text with object keys sorted at every level, as serde_json writes a
 *  `Map` (the desktop's form; only the bytes stored are ever hashed). */
export function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** Links a new event after `prev` (null: the first link). Pure: the store and
 *  the shared fixture's generator both build events with it. */
export function buildEvent(
  ev: NewWebEvent,
  prev: { seq: number; hash: string } | null,
  at: { id: string; at: string; hlc: string },
): AuditEvent {
  const changes = sortedJson(ev.changes);
  const event: AuditEvent = {
    id: at.id,
    // Outside the hash and the content: the desktop files the event under its
    // own workspace (web payloads carry no real one before ADR-0019).
    workspaceId: "",
    projectId: ev.projectId,
    at: at.at,
    hlc: at.hlc,
    deviceId: WEB_DEVICE,
    actor: `user:${ev.userId}`,
    onBehalfOf: null,
    action: ev.action,
    entity: ev.entity,
    entityId: ev.entityId,
    entityKey: ev.entityKey,
    changes,
    changesSha256: sha256Hex(changes),
    summary: ev.summary === undefined || ev.summary === null ? null : sortedJson(ev.summary),
    // No new origin: a desktop's CHECK (local migration 0019) would skip it.
    origin: "local",
    chainWorkspaceId: WEB_CHAIN_WORKSPACE,
    chainOwner: ev.userId,
    chainSeq: (prev?.seq ?? 0) + 1,
    prevHash: prev?.hash ?? null,
    hash: "",
    redactedAt: null,
  };
  event.hash = hashOf(event);
  return event;
}

/** Appends one web event to the user's chain and stores it as an
 *  `audit_event` document. The caller holds the user's write lock and runs
 *  the change in the same transaction. `after`: the HLC of the change, so the
 *  event is stamped after it. */
export async function appendWebEvent(
  client: PoolClient,
  clock: ServerClock,
  ev: NewWebEvent,
  after?: string,
): Promise<AuditEvent> {
  const { rows } = await client.query<{ seq: string; hash: string }>(
    `SELECT seq, hash FROM audit_chain_heads
      WHERE user_id = $1 AND device_id = $2 AND chain_workspace_id = $3 AND chain_owner = $4
      FOR UPDATE`,
    [ev.userId, WEB_DEVICE, WEB_CHAIN_WORKSPACE, ev.userId],
  );
  const prev = rows[0] ? { seq: Number(rows[0].seq), hash: rows[0].hash } : null;
  const event = buildEvent(ev, prev, { id: randomUUID(), at: new Date().toISOString(), hlc: clock.stamp(after) });
  const stored = await storeAppend(client, ev.userId, {
    entity: "audit_event",
    entityId: event.id,
    op: "append",
    payload: { ...event },
    revision: 1,
    author: event.actor,
    hlc: event.hlc,
  });
  if (!stored.accepted) throw new Error("audit: the web event could not be stored");
  await client.query(
    `INSERT INTO audit_chain_heads (user_id, device_id, chain_workspace_id, chain_owner, seq, hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, device_id, chain_workspace_id, chain_owner) DO UPDATE
       SET seq = EXCLUDED.seq, hash = EXCLUDED.hash, updated_at = now()`,
    [ev.userId, WEB_DEVICE, WEB_CHAIN_WORKSPACE, ev.userId, event.chainSeq, event.hash],
  );
  return event;
}
