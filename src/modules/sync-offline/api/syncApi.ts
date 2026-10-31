// Offline sync client surface (Phase 8, spec §9). Reads the local oplog's pending
// count for the status indicator and runs the delta push/pull against the
// backend. The desktop holds the local DB + oplog. The web has neither: it is
// a client of the server (BASE-10), so it has nothing pending and no
// conflicts, and "Sync now" only reloads the open pages (after handing over
// what an older web version left in the browser, `web/legacyWebData.ts`).
// Phase 8C: deltas carry their base + HLC; the server rejects diverged ones and
// they are kept as conflicts for the conflict panel (never silently overwritten).
// Everything runs for the signed-in account only (FIX-07); pushes go in batches
// with retries (FIX-03) and pulls page until the server has no more (FIX-02).

import type { Assert, Contract, Covers } from "@shared/contracts";
import { getSession } from "@modules/auth";
import { invoke as platformInvoke, isTauri } from "@shared/platform";
import type { ConflictResolution, SyncConflict } from "../domain/conflict";
import { logRefusedChanges, logSyncFailure } from "./syncFailure";
import {
  batchDeltas,
  pullPages,
  sendIsolating,
  SyncHttpError,
  syncRequest,
  withRetry,
  type RemoteDoc,
} from "./transport";
import { drainLegacyWebData } from "../web/legacyWebData";

/** Outcome of one sync cycle. */
export interface SyncResult {
  pushed: number;
  pulled: number;
  /** Deltas the server rejected in this cycle (now open conflicts). */
  conflicts: number;
  /** Deltas the server refused for their content (too large, invalid); they
   *  stay pending and are reported to the user. */
  skipped: number;
}
export type SyncStatus = "offline" | "conflicts" | "pending" | "synced";

/** One pending delta as built by Rust (`sync::Delta`). */
export interface PendingDelta {
  entity: string;
  entityId: string;
  op: "upsert" | "delete" | "append";
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

export interface LocalSyncState {
  pending: number;
  conflicts: number;
  /** Desktop: pending changes with no owner yet, which cannot sync. */
  orphans?: number;
}

/** The signed-in account's changes not yet synced and its open conflicts. */
export async function syncLocalState(): Promise<LocalSyncState> {
  const session = await getSession();
  if (!session) return { pending: 0, conflicts: 0 };
  if (!isTauri()) return { pending: 0, conflicts: 0 };
  return platformInvoke<LocalSyncState>("oplog_pending_count", {
    userId: session.userId,
  });
}

/** Count of local mutations not yet synced to the backend. */
export async function syncPendingCount(): Promise<number> {
  return (await syncLocalState()).pending;
}

/** A pushed key another live document of the project already uses (DAT-01). */
export interface KeyConflictDoc {
  entity: string;
  entityId: string;
  key: string;
  takenBy: string;
}

/** Most lease requests per call to `/sync/key-blocks` (the server's limit). */
const MAX_LEASE_REQUESTS = 300;

/** Leases the key blocks this device needs and gives its provisional keys a
 *  definitive one (DAT-01, ADR-0010). A server without the endpoint (404,
 *  older than this app) is not an error: keys stay provisional until it has
 *  it. */
export async function leaseKeyBlocks(
  token: string,
  userId: string,
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>,
): Promise<void> {
  const requests = (await invoke<unknown[] | undefined>("key_lease_requests", { userId })) ?? [];
  const blocks: unknown[] = [];
  try {
    for (let i = 0; i < requests.length; i += MAX_LEASE_REQUESTS) {
      const part = requests.slice(i, i + MAX_LEASE_REQUESTS);
      const body = await withRetry(() =>
        syncRequest<{ blocks?: unknown[] }>("/sync/key-blocks", token, {
          method: "POST",
          body: { requests: part },
        }),
      );
      blocks.push(...(body.blocks ?? []));
    }
  } catch (e) {
    if (!(e instanceof SyncHttpError && e.status === 404)) throw e;
    console.warn("[sync] the server has no key blocks yet; keys stay provisional");
  }
  // Even with no new block, provisional keys may fit in a block leased before.
  await invoke("key_blocks_apply", { userId, blocks });
}

/** A pushed append-only document the server already holds with other content
 *  (AUD-01). It stays pending and is logged; only a bug or tampering makes one. */
interface AppendRejectedDoc {
  entity: string;
  entityId: string;
  reason: string;
}

/** Pushes the account's pending append-only documents (audit events) in
 *  batches and marks the accepted ones synced. Returns how many were refused
 *  (by content, or `appendRejected`); they stay pending and are logged. */
export async function pushAppendOnly(
  token: string,
  userId: string,
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>,
): Promise<number> {
  const { deltas } = await invoke<{ deltas: PendingDelta[] }>("oplog_pending", {
    userId,
    class: "append_only",
  });
  let refusedCount = 0;
  const send = (part: PendingDelta[]) =>
    withRetry(() =>
      syncRequest<{ appendRejected?: AppendRejectedDoc[] }>("/sync/push", token, {
        method: "POST",
        body: { deltas: part.map(({ opIds: _opIds, ...d }) => d) },
      }),
    );
  for (const batch of batchDeltas(deltas)) {
    const refused = await sendIsolating(batch, send, async (part, body) => {
      const rejected = body.appendRejected ?? [];
      const { accepted, rejected: refusedHere } = splitPushed(part, rejected);
      await invoke("oplog_mark_synced", { userId, deltas: accepted });
      // The server keeps its own version for good: never resend these.
      if (refusedHere.length > 0) {
        await invoke("oplog_mark_rejected", { userId, opIds: refusedHere.flatMap((d) => d.opIds) });
      }
      logRefusedChanges(rejected);
      refusedCount += rejected.length;
    });
    logRefusedChanges(refused);
    refusedCount += refused.length;
  }
  return refusedCount;
}

/** Pushes the account's pending lww deltas in batches: each accepted batch is
 *  marked synced at once, rejected deltas become conflicts, as do keys another
 *  document already has; deltas the server refuses for their content are
 *  skipped and stay pending. Test cases wait while the server has not listed
 *  `stable-steps` (DAT-02): `oplog_pending` leaves them out. */
async function pushLww(
  token: string,
  userId: string,
  invoke: typeof platformInvoke,
) {
  const { deltas } = await invoke<{ deltas: PendingDelta[] }>("oplog_pending", {
    userId,
  });
  let pushed = 0;
  let conflicts = 0;
  let skipped = 0;
  const send = (part: PendingDelta[]) =>
    withRetry(() =>
      syncRequest<{ conflicts?: RemoteDoc[]; keyConflicts?: KeyConflictDoc[] }>(
        "/sync/push",
        token,
        {
          method: "POST",
          body: { deltas: part.map(({ opIds: _opIds, ...d }) => d) },
        },
      ),
    );
  for (const batch of batchDeltas(deltas)) {
    // A delta the server refuses for its content (e.g. 413) is skipped and
    // stays pending; the other batches and the pull still run.
    const refused = await sendIsolating(batch, send, async (part, body) => {
      const rejected = body.conflicts ?? [];
      const keyRejected = body.keyConflicts ?? [];
      const { accepted } = splitPushed(part, [...rejected, ...keyRejected]);
      await invoke("oplog_mark_synced", { userId, deltas: accepted });
      // The server's versions of rejected deltas: applying them while the
      // local change is still pending records the conflict instead of
      // overwriting.
      if (rejected.length > 0) {
        await invoke("apply_remote", { userId, docs: rejected });
      }
      // A key another document already has (DAT-01): the row gets a
      // provisional key and waits for the user in the conflict panel.
      if (keyRejected.length > 0) {
        await invoke("key_conflicts_record", { userId, items: keyRejected });
      }
      pushed += accepted.length;
      conflicts += rejected.length + keyRejected.length;
    });
    skipped += refused.length;
    logRefusedChanges(refused);
  }
  return { pushed, conflicts, skipped };
}

/** Runs one desktop sync cycle for the signed-in account: lease key blocks
 *  and finalize provisional keys (DAT-01), push its pending deltas
 *  (`pushLww`), then pull every page after its cursor and record the
 *  server's features. A server that lists `stable-steps` then takes the
 *  test cases held back so far (DAT-02), and one with `append-only` the
 *  audit events and case revisions (AUD-01). Throws on network/auth/version
 *  errors (after retries); callers toast. */
export async function syncNow(): Promise<SyncResult> {
  if (!isTauri()) throw new Error("sync-desktop-only");
  // Token and user from one read: never push one account's changes with
  // another account's token (FIX-07).
  const session = await getSession();
  if (!session) throw new Error("not-authenticated");
  const { accessToken: token, userId } = session;
  const invoke = platformInvoke;

  // Key blocks first (DAT-01): provisional keys get their definitive one
  // before the push, so it carries them.
  await leaseKeyBlocks(token, userId, invoke);

  // Push.
  let { pushed, conflicts, skipped } = await pushLww(token, userId, invoke);

  // Pull. The cursor lives in the local DB (wiped with the data), one per
  // account, so an empty DB re-pulls everything.
  const cursor = await invoke<string>("sync_cursor_get", { userId });
  let serverFeatures: string[] = [];
  const pulled = await pullPages(token, cursor, async (page) => {
    serverFeatures = page.features ?? serverFeatures;
    if (page.docs.length > 0) {
      await invoke("apply_remote", { userId, docs: page.docs });
    }
    await invoke("sync_cursor_set", { userId, value: String(page.cursor) });
  });
  // What the server can take decides what goes next time, and now.
  await invoke("sync_server_features_set", {
    userId,
    features: serverFeatures,
  });
  // Test cases held back until the server listed `stable-steps` (DAT-02, the
  // first sync after an upgrade) go now; usually nothing is left to send.
  if (serverFeatures.includes("stable-steps")) {
    const late = await pushLww(token, userId, invoke);
    pushed += late.pushed;
    conflicts += late.conflicts;
    skipped += late.skipped;
  }

  // Append-only documents (audit events, AUD-01; case revisions, DAT-02) go last, and only to a
  // server that knows the class; an older one never sees them and they stay
  // pending. They never conflict, so after the pull is as good as before. A
  // refused one, or a failed push of them, is logged, not shown: they are not
  // changes people make, and the sync of their data already succeeded.
  if (serverFeatures.includes("append-only")) {
    try {
      await pushAppendOnly(token, userId, invoke);
    } catch (e) {
      logSyncFailure(e, "audit-push");
    }
  }
  // Tell open pages to reload from the (now updated) local DB.
  if (pulled > 0) window.dispatchEvent(new CustomEvent("pharos:synced"));
  if (skipped > 0) {
    window.dispatchEvent(
      new CustomEvent("pharos:sync-skipped", { detail: { count: skipped } }),
    );
  }

  return { pushed, pulled, conflicts, skipped };
}

/** One sync on either platform: the desktop cycle. On the web every change
 *  is already on the server, so it hands over the old browser store once and
 *  tells the open pages to reload. */
export async function syncAny(): Promise<SyncResult> {
  if (isTauri()) return syncNow();
  const { pushed, leftovers } = await drainLegacyWebData();
  window.dispatchEvent(new CustomEvent("pharos:synced"));
  return { pushed, pulled: 0, conflicts: 0, skipped: leftovers };
}

/** Open conflicts of the signed-in account, oldest first. */
export async function listConflicts(): Promise<SyncConflict[]> {
  const session = await getSession();
  if (!session || !isTauri()) return [];
  return platformInvoke<SyncConflict[]>("sync_conflicts_list", {
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
  if (!isTauri()) throw new Error("sync-desktop-only");
  await platformInvoke("sync_conflict_resolve", {
    userId: session.userId,
    id,
    resolution,
  });
  window.dispatchEvent(new CustomEvent("pharos:synced"));
}

/** A row of this device that lost its key to another document (DAT-01): it
 *  has a provisional key until the user picks a new one. Desktop only. */
export interface KeyConflict {
  id: string;
  entity: string;
  entityId: string;
  projectId: string;
  title: string;
  /** The key another document has. */
  lostKey: string;
  /** The provisional key it has meanwhile. */
  currentKey: string;
}

/** Open key conflicts of the signed-in account (none on the web). */
export async function listKeyConflicts(): Promise<KeyConflict[]> {
  const session = await getSession();
  if (!session || !isTauri()) return [];
  return platformInvoke<KeyConflict[]>("key_conflicts_list", { userId: session.userId });
}

/** Gives the row `key`, or the next number of its project when omitted
 *  (fails with `no-key-block` until a sync leases a block). Returns the key. */
export async function resolveKeyConflict(id: string, key?: string): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("not-authenticated");
  const assigned = await platformInvoke<string>("key_conflict_resolve", {
    userId: session.userId,
    id,
    key: key ?? null,
  });
  window.dispatchEvent(new CustomEvent("pharos:synced"));
  return assigned;
}

// The Rust contract (BASE-05, ADR-0026): `tsc` fails if these stop matching
// the Rust types they are read from or sent to.
export type _RustContract = [
  Assert<Covers<Contract.Delta, PendingDelta>>,
  Assert<Covers<PendingDelta, Contract.PushedDelta>>,
  Assert<Covers<Contract.SyncState, LocalSyncState>>,
  Assert<Covers<KeyConflictDoc, Contract.RejectedKey>>,
  Assert<Covers<Contract.KeyConflict, KeyConflict>>,
];
