// Offline sync client surface (Phase 8, spec §9). Reads the local oplog's pending
// count for the status indicator and runs the delta push/pull against the
// backend. The desktop holds the local DB + oplog; in the browser the same
// surface is served by `web/webSync.ts` (outbox + web conflicts).
// Phase 8C: deltas carry their base + HLC; the server rejects diverged ones and
// they are kept as conflicts for the conflict panel (never silently overwritten).
// Everything runs for the signed-in account only (FIX-07); pushes go in batches
// with retries (FIX-03) and pulls page until the server has no more (FIX-02).

import { getSession } from "@modules/auth";
import type { ConflictResolution, SyncConflict } from "../domain/conflict";
import {
  batchDeltas,
  pullPages,
  syncRequest,
  withRetry,
  type RemoteDoc,
} from "./transport";
import {
  hydrateFromBackend,
  resolveWebConflict,
  webConflicts,
  webLocalState,
  type SyncResult,
} from "../web/webSync";

export type { SyncResult };
export type SyncStatus = "offline" | "conflicts" | "pending" | "synced";

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
export function splitPushed<T extends { entity: string; entityId: string }>(
  deltas: T[],
  conflicts: Pick<RemoteDoc, "entity" | "entityId">[],
): { accepted: T[]; rejected: T[] } {
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

/** The signed-in account's changes not yet synced and its open conflicts. */
export async function syncLocalState(): Promise<LocalSyncState> {
  const session = await getSession();
  if (!session) return { pending: 0, conflicts: 0 };
  if (!isTauri()) return webLocalState(session.userId);
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<LocalSyncState>("oplog_pending_count", {
    userId: session.userId,
  });
}

/** Count of local mutations not yet synced to the backend. */
export async function syncPendingCount(): Promise<number> {
  return (await syncLocalState()).pending;
}

/** Runs one desktop sync cycle for the signed-in account: push its pending
 *  deltas in batches (each accepted batch is marked synced at once, rejected
 *  deltas become conflicts), then pull every page after its cursor. Throws on
 *  network/auth/version errors (after retries); callers toast. */
export async function syncNow(): Promise<SyncResult> {
  if (!isTauri()) throw new Error("sync-desktop-only");
  // Token and user from one read: never push one account's changes with
  // another account's token (FIX-07).
  const session = await getSession();
  if (!session) throw new Error("not-authenticated");
  const { accessToken: token, userId } = session;
  const { invoke } = await import("@tauri-apps/api/core");

  // Push.
  const { deltas } = await invoke<{ deltas: PendingDelta[] }>("oplog_pending", {
    userId,
  });
  let pushed = 0;
  let conflicts = 0;
  for (const batch of batchDeltas(deltas)) {
    const body = await withRetry(() =>
      syncRequest<{ conflicts?: RemoteDoc[] }>("/sync/push", token, {
        method: "POST",
        body: { deltas: batch.map(({ opIds: _opIds, ...d }) => d) },
      }),
    );
    const rejected = body.conflicts ?? [];
    const { accepted } = splitPushed(batch, rejected);
    await invoke("oplog_mark_synced", { userId, deltas: accepted });
    // The server's versions of rejected deltas: applying them while the local
    // change is still pending records the conflict instead of overwriting.
    if (rejected.length > 0) {
      await invoke("apply_remote", { userId, docs: rejected });
    }
    pushed += accepted.length;
    conflicts += rejected.length;
  }

  // Pull. The cursor lives in the local DB (wiped with the data), one per
  // account, so an empty DB re-pulls everything.
  const cursor = await invoke<string>("sync_cursor_get", { userId });
  const pulled = await pullPages(token, cursor, async (page) => {
    if (page.docs.length > 0) {
      await invoke("apply_remote", { userId, docs: page.docs });
    }
    await invoke("sync_cursor_set", { userId, value: String(page.cursor) });
  });
  // Tell open pages to reload from the (now updated) local DB.
  if (pulled > 0) window.dispatchEvent(new CustomEvent("pharos:synced"));

  return { pushed, pulled, conflicts };
}

/** One sync on either platform: the desktop cycle, or on the web the outbox
 *  flush + incremental pull. */
export async function syncAny(): Promise<SyncResult> {
  if (isTauri()) return syncNow();
  return hydrateFromBackend();
}

/** Open conflicts of the signed-in account, oldest first. */
export async function listConflicts(): Promise<SyncConflict[]> {
  const session = await getSession();
  if (!session) return [];
  if (!isTauri()) return webConflicts(session.userId);
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SyncConflict[]>("sync_conflicts_list", {
    userId: session.userId,
  });
}

/** Keeps one version of the entity. `local` re-bases this device's version on
 *  the server one (pushed on the next sync); `remote` takes the server's. */
export async function resolveConflict(
  id: string,
  resolution: ConflictResolution,
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("not-authenticated");
  if (!isTauri()) {
    await resolveWebConflict(session.userId, id, resolution);
  } else {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("sync_conflict_resolve", {
      userId: session.userId,
      id,
      resolution,
    });
  }
  window.dispatchEvent(new CustomEvent("pharos:synced"));
}
