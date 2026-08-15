// Offline sync client surface (Phase 8, spec §9). Reads the local oplog's pending
// count for the status indicator and runs the delta push/pull against the
// backend. The desktop holds the local DB + oplog, so sync is desktop-only.

import { getAccessToken } from "@modules/auth";

export type SyncStatus = "offline" | "pending" | "synced";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";

interface PendingDeltas {
  deltas: unknown[];
  ids: string[];
}
interface RemoteDoc {
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  revision: number;
  deleted: boolean;
}

/** Pure status derivation for the indicator (testable). */
export function syncStatus(online: boolean, pending: number): SyncStatus {
  if (!online) return "offline";
  return pending > 0 ? "pending" : "synced";
}

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/** Count of local mutations not yet synced to the backend (0 in the browser
 *  fallback, which has no oplog). */
export async function syncPendingCount(): Promise<number> {
  if (!isTauri()) return 0;
  const { invoke } = await import("@tauri-apps/api/core");
  const res = await invoke<{ pending: number }>("oplog_pending_count");
  return res.pending;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

/** Runs one sync cycle: push pending local deltas, mark them synced, then pull
 *  remote changes since the stored cursor and apply them. Desktop-only (the
 *  local DB/oplog live in Rust). Throws on network/auth errors; callers toast. */
export async function syncNow(): Promise<SyncResult> {
  if (!isTauri()) throw new Error("sync-desktop-only");
  const token = await getAccessToken();
  if (!token) throw new Error("not-authenticated");
  const { invoke } = await import("@tauri-apps/api/core");
  const authHeader = { authorization: `Bearer ${token}` };

  // Push.
  const pending = await invoke<PendingDeltas>("oplog_pending");
  if (pending.deltas.length > 0) {
    const res = await fetch(`${API_URL}/sync/push`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader },
      body: JSON.stringify({ deltas: pending.deltas }),
    });
    if (!res.ok) throw new Error(`push ${res.status}`);
    await invoke("oplog_mark_synced", { ids: pending.ids });
  }

  // Pull. The cursor lives in the local DB (wiped with the data), so an empty
  // DB re-pulls everything.
  const cursor = await invoke<string>("sync_cursor_get");
  const res = await fetch(`${API_URL}/sync/pull?since=${cursor}`, { headers: authHeader });
  if (!res.ok) throw new Error(`pull ${res.status}`);
  const body = (await res.json()) as { docs: RemoteDoc[]; cursor: number };
  if (body.docs.length > 0) {
    await invoke("apply_remote", { docs: body.docs });
    // Tell open pages to reload from the (now updated) local DB.
    window.dispatchEvent(new CustomEvent("pharos:synced"));
  }
  await invoke("sync_cursor_set", { value: String(body.cursor) });

  return { pushed: pending.deltas.length, pulled: body.docs.length };
}
