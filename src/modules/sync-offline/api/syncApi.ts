// Offline sync client surface (Phase 8, spec §9). Reads the local oplog's pending
// count for the status indicator and runs the delta push/pull against the
// backend. The desktop holds the local DB + oplog, so sync is desktop-only.
// Phase 8C: deltas carry their base + HLC; the server rejects diverged ones and
// they are kept as conflicts for the conflict panel (never silently overwritten).

import { getAccessToken } from "@modules/auth";
import type { ConflictResolution, SyncConflict } from "../domain/conflict";

export type SyncStatus = "offline" | "conflicts" | "pending" | "synced";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:3000";

/** One pending delta as built by Rust (`sync::Delta`). */
export interface PendingDelta {
  entity: string;
  entityId: string;
  op: "upsert" | "delete";
  payload: unknown;
  revision: number;
  author: string;
  hlc: string;
  baseRevision: number | null;
  baseHlc: string | null;
  opIds: string[];
}
interface RemoteDoc {
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  revision: number;
  deleted: boolean;
  hlc: string;
}

/** Pure status derivation for the indicator (testable). Open conflicts win
 *  over plain pending changes: they need the user. */
export function syncStatus(
  online: boolean,
  pending: number,
  conflicts = 0,
): SyncStatus {
  if (!online) return "offline";
  if (conflicts > 0) return "conflicts";
  return pending > 0 ? "pending" : "synced";
}

/** Splits a push into the deltas the server accepted and the rejected ones,
 *  matched by entity against the conflicts it returned (pure, testable). */
export function splitPushed(
  deltas: PendingDelta[],
  conflicts: Pick<RemoteDoc, "entity" | "entityId">[],
): { accepted: PendingDelta[]; rejected: PendingDelta[] } {
  const key = (d: { entity: string; entityId: string }) =>
    `${d.entity}:${d.entityId}`;
  const conflicted = new Set(conflicts.map(key));
  return {
    accepted: deltas.filter((d) => !conflicted.has(key(d))),
    rejected: deltas.filter((d) => conflicted.has(key(d))),
  };
}

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export interface LocalSyncState {
  pending: number;
  conflicts: number;
}

/** Local mutations not yet synced and open conflicts (both 0 in the browser
 *  fallback, which has no oplog). */
export async function syncLocalState(): Promise<LocalSyncState> {
  if (!isTauri()) return { pending: 0, conflicts: 0 };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<LocalSyncState>("oplog_pending_count");
}

/** Count of local mutations not yet synced to the backend. */
export async function syncPendingCount(): Promise<number> {
  return (await syncLocalState()).pending;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  /** Deltas the server rejected in this cycle (now open conflicts). */
  conflicts: number;
}

/** Runs one sync cycle: push pending local deltas, mark the accepted ones
 *  synced and record the rejected ones as conflicts, then pull remote changes
 *  since the stored cursor and apply them. Desktop-only (the local DB/oplog
 *  live in Rust). Throws on network/auth errors; callers toast. */
export async function syncNow(): Promise<SyncResult> {
  if (!isTauri()) throw new Error("sync-desktop-only");
  const token = await getAccessToken();
  if (!token) throw new Error("not-authenticated");
  const { invoke } = await import("@tauri-apps/api/core");
  const authHeader = { authorization: `Bearer ${token}` };

  // Push.
  const { deltas } = await invoke<{ deltas: PendingDelta[] }>("oplog_pending");
  let accepted: PendingDelta[] = [];
  let rejected: RemoteDoc[] = [];
  if (deltas.length > 0) {
    const res = await fetch(`${API_URL}/sync/push`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader },
      body: JSON.stringify({
        deltas: deltas.map(({ opIds: _opIds, ...d }) => d),
      }),
    });
    if (!res.ok) throw new Error(`push ${res.status}`);
    const body = (await res.json()) as { conflicts?: RemoteDoc[] };
    rejected = body.conflicts ?? [];
    accepted = splitPushed(deltas, rejected).accepted;
    await invoke("oplog_mark_synced", { deltas: accepted });
    // The server's versions of rejected deltas: applying them while the local
    // change is still pending records the conflict instead of overwriting.
    if (rejected.length > 0) await invoke("apply_remote", { docs: rejected });
  }

  // Pull. The cursor lives in the local DB (wiped with the data), so an empty
  // DB re-pulls everything.
  const cursor = await invoke<string>("sync_cursor_get");
  const res = await fetch(`${API_URL}/sync/pull?since=${cursor}`, {
    headers: authHeader,
  });
  if (!res.ok) throw new Error(`pull ${res.status}`);
  const body = (await res.json()) as { docs: RemoteDoc[]; cursor: number };
  if (body.docs.length > 0) {
    await invoke("apply_remote", { docs: body.docs });
    // Tell open pages to reload from the (now updated) local DB.
    window.dispatchEvent(new CustomEvent("pharos:synced"));
  }
  await invoke("sync_cursor_set", { value: String(body.cursor) });

  return {
    pushed: accepted.length,
    pulled: body.docs.length,
    conflicts: rejected.length,
  };
}

/** Open conflicts, oldest first (desktop only; none in the browser). */
export async function listConflicts(): Promise<SyncConflict[]> {
  if (!isTauri()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SyncConflict[]>("sync_conflicts_list");
}

/** Keeps one version of the entity. `local` re-bases this device's version on
 *  the server one (pushed on the next sync); `remote` takes the server's. */
export async function resolveConflict(
  id: string,
  resolution: ConflictResolution,
): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("sync_conflict_resolve", { id, resolution });
  window.dispatchEvent(new CustomEvent("pharos:synced"));
}
