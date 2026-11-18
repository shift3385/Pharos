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
// An access token that expires before or during a sync is renewed
// (`sessionRequester`).

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
  withRetry,
  type RemoteDoc,
  type SyncCaller,
} from "./transport";
import { sessionRequester } from "./sessionRequest";
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
  /** The workspace the change belongs to (SYNC-07); null when unknown. */
  workspaceId?: string | null;
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

/** Where a sync cycle sends things when the server has workspaces (SYNC-07,
 *  ADR-0042 §2): each project's workspace, and the personal one for anything
 *  else. Absent for a server without them: everything goes as before. */
export interface WorkspaceRoute {
  personal: string;
  /** Workspace ids the server listed for the account. */
  ids: Set<string>;
  /** projectId → workspace, from the local rows. */
  ofProject: Record<string, string>;
}

/** The workspace a change goes to: its own, if the server listed it, else
 *  the personal one (the server sets the location anyway). */
function routeOf(route: WorkspaceRoute, ws: string | null | undefined): string {
  return ws && route.ids.has(ws) ? ws : route.personal;
}

/** Splits items by the workspace `pick` names (one group without a route). */
function groupBy<T>(items: T[], route: WorkspaceRoute | undefined, pick: (t: T) => string | null | undefined) {
  const groups = new Map<string | undefined, T[]>();
  for (const item of items) {
    const ws = route ? routeOf(route, pick(item)) : undefined;
    groups.set(ws, [...(groups.get(ws) ?? []), item]);
  }
  return groups;
}

/** True for the answers that say the account no longer reaches a workspace
 *  (removed, or the workspace deleted): that workspace is skipped, the rest
 *  of the cycle goes on. */
const lostWorkspace = (e: unknown) =>
  e instanceof SyncHttpError && ["workspace_revoked", "workspace_not_found"].includes(e.code);

/** Leases the key blocks this device needs and gives its provisional keys a
 *  definitive one (DAT-01, ADR-0010). With workspaces, each project's blocks
 *  are asked for in its workspace. A server without the endpoint (404,
 *  older than this app) is not an error: keys stay provisional until it has
 *  it. */
export async function leaseKeyBlocks(
  request: SyncCaller,
  userId: string,
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>,
  route?: WorkspaceRoute,
): Promise<void> {
  const requests =
    (await invoke<{ projectId: string }[] | undefined>("key_lease_requests", { userId })) ?? [];
  const blocks: unknown[] = [];
  try {
    for (const [ws, group] of groupBy(requests, route, (r) => route?.ofProject[r.projectId])) {
      for (let i = 0; i < group.length; i += MAX_LEASE_REQUESTS) {
        const part = group.slice(i, i + MAX_LEASE_REQUESTS);
        try {
          const body = await withRetry(() =>
            request<{ blocks?: unknown[] }>("/sync/key-blocks", {
              method: "POST",
              body: { requests: part, ...(ws ? { workspaceId: ws } : {}) },
            }),
          );
          blocks.push(...(body.blocks ?? []));
        } catch (e) {
          if (!lostWorkspace(e)) throw e;
        }
      }
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

/** A delta the server refused without writing it (SYNC-07, ADR-0042 §2):
 *  the role does not allow it, the entity moved to another workspace, or it
 *  lives in one the account left. */
export interface RefusedDoc {
  entity: string;
  entityId: string;
  reason: "forbidden" | "moved" | "not_found";
  workspaceId?: string;
}

/** One push request, to a workspace when there is one. */
function pushTo<B>(request: SyncCaller, ws: string | undefined) {
  return (part: PendingDelta[]) =>
    withRetry(() =>
      request<B>("/sync/push", {
        method: "POST",
        body: {
          deltas: part.map(({ opIds: _opIds, workspaceId: _ws, ...d }) => d),
          ...(ws ? { workspaceId: ws } : {}),
        },
      }),
    );
}

/** Records what the server refused: `moved` relocates the row (its change
 *  goes to the new workspace next cycle), the others wait for the user. */
async function recordRefused(
  invoke: typeof platformInvoke,
  userId: string,
  refused: RefusedDoc[] | undefined,
): Promise<number> {
  if (!refused?.length) return 0;
  await invoke("sync_refused_record", { userId, items: refused });
  return refused.filter((r) => r.reason !== "moved").length;
}

/** Pushes the account's pending append-only documents (audit events) in
 *  batches and marks the accepted ones synced. Returns how many were refused
 *  (by content, or `appendRejected`); they stay pending and are logged. */
export async function pushAppendOnly(
  request: SyncCaller,
  userId: string,
  invoke: typeof platformInvoke,
  route?: WorkspaceRoute,
): Promise<number> {
  const { deltas } = await invoke<{ deltas: PendingDelta[] }>("oplog_pending", {
    userId,
    class: "append_only",
  });
  let refusedCount = 0;
  for (const [ws, group] of groupBy(deltas, route, (d) => d.workspaceId)) {
    const send = pushTo<{ appendRejected?: AppendRejectedDoc[]; rejected?: RefusedDoc[] }>(request, ws);
    try {
      for (const batch of batchDeltas(group)) {
        const refused = await sendIsolating(batch, send, async (part, body) => {
          const rejected = body.appendRejected ?? [];
          const notStored = body.rejected ?? [];
          const { accepted, rejected: refusedHere } = splitPushed(part, [...rejected, ...notStored]);
          await invoke("oplog_mark_synced", { userId, deltas: accepted });
          // The server keeps its own version for good: never resend these.
          const kept = splitPushed(refusedHere, rejected).rejected;
          if (kept.length > 0) {
            await invoke("oplog_mark_rejected", { userId, opIds: kept.flatMap((d) => d.opIds) });
          }
          await recordRefused(invoke, userId, notStored);
          logRefusedChanges(rejected);
          refusedCount += rejected.length + notStored.length;
        });
        logRefusedChanges(refused);
        refusedCount += refused.length;
      }
    } catch (e) {
      if (!lostWorkspace(e)) throw e;
    }
  }
  return refusedCount;
}

/** Pushes the account's pending lww deltas in batches, each to its
 *  workspace: each accepted batch is marked synced at once, rejected deltas
 *  become conflicts, as do keys another document already has; deltas the
 *  server refuses for their content are skipped and stay pending, and those
 *  it refuses for the role wait for the user. Test cases wait while the
 *  server has not listed `stable-steps` (DAT-02): `oplog_pending` leaves
 *  them out. */
/** Entities whose content travels by hash outside the oplog (SYNC-04b). */
const BLOB_ENTITIES = new Set(["attachment", "template"]);

/** Moves attachment and template contents of a workspace (SYNC-04b): the
 *  ones its pending documents name before the push (`upload`), the ones only
 *  the server has after the pull (`download`). Rust does it, so the bytes
 *  never cross the webview; a content that fails is tried again next sync. */
async function transferBlobs(
  invoke: typeof platformInvoke,
  userId: string,
  workspaceId: string,
  phase: "upload" | "download",
): Promise<void> {
  try {
    const done = await invoke<{ uploaded: number; downloaded: number; failed: number }>("blobs_transfer", {
      userId,
      workspaceId,
      phase,
    });
    if (done && done.failed > 0) logSyncFailure(new Error(`blobs-${phase}: ${done.failed} failed`), "blobs");
  } catch (e) {
    logSyncFailure(e, "blobs");
  }
}

async function pushLww(
  request: SyncCaller,
  userId: string,
  invoke: typeof platformInvoke,
  route?: WorkspaceRoute,
) {
  const { deltas } = await invoke<{ deltas: PendingDelta[] }>("oplog_pending", {
    userId,
  });
  let pushed = 0;
  let conflicts = 0;
  let skipped = 0;
  const lost: string[] = [];
  for (const [ws, group] of groupBy(deltas, route, (d) => d.workspaceId)) {
    const send = pushTo<{ conflicts?: RemoteDoc[]; keyConflicts?: KeyConflictDoc[]; rejected?: RefusedDoc[] }>(
      request,
      ws,
    );
    // Contents first: the documents that name them must find them there.
    if (ws && group.some((d) => BLOB_ENTITIES.has(d.entity))) {
      await transferBlobs(invoke, userId, ws, "upload");
    }
    try {
      for (const batch of batchDeltas(group)) {
        // A delta the server refuses for its content (e.g. 413) is skipped and
        // stays pending; the other batches and the pull still run.
        const refused = await sendIsolating(batch, send, async (part, body) => {
          const rejected = body.conflicts ?? [];
          const keyRejected = body.keyConflicts ?? [];
          const notStored = body.rejected ?? [];
          const { accepted } = splitPushed(part, [...rejected, ...keyRejected, ...notStored]);
          await invoke("oplog_mark_synced", { userId, deltas: accepted });
          // The server's versions of rejected deltas: applying them while the
          // local change is still pending records the conflict instead of
          // overwriting.
          if (rejected.length > 0) {
            await invoke("apply_remote", { userId, docs: rejected, workspaceId: ws ?? null });
          }
          // A key another document already has (DAT-01): the row gets a
          // provisional key and waits for the user in the conflict panel.
          if (keyRejected.length > 0) {
            await invoke("key_conflicts_record", { userId, items: keyRejected });
          }
          const waiting = await recordRefused(invoke, userId, notStored);
          pushed += accepted.length;
          conflicts += rejected.length + keyRejected.length + waiting;
        });
        skipped += refused.length;
        logRefusedChanges(refused);
      }
    } catch (e) {
      if (!lostWorkspace(e) || !ws) throw e;
      lost.push(ws);
    }
  }
  return { pushed, conflicts, skipped, lost };
}

/** A workspace of the account as `GET /workspaces` lists it. */
export interface ServerWorkspace {
  id: string;
  name: string;
  kind: "personal" | "shared";
  role: string;
  independentApproval?: boolean;
  members?: unknown[];
}

/** The account's workspaces, or null when the server has none (404: older
 *  than workspaces, SYNC-07). */
async function fetchWorkspaces(request: SyncCaller): Promise<ServerWorkspace[] | null> {
  try {
    const body = await withRetry(() => request<{ workspaces?: ServerWorkspace[] }>("/workspaces"));
    return Array.isArray(body?.workspaces) ? body.workspaces : null;
  } catch (e) {
    if (e instanceof SyncHttpError && e.status === 404) return null;
    throw e;
  }
}

/** A workspace the account lost, as the device's mirror reports it. */
export interface RevokedWorkspace {
  id: string;
  name: string;
  projects: number;
  pending: number;
}

/** Runs one desktop sync cycle for the signed-in account. With a server
 *  that has workspaces (SYNC-07): refresh the account's workspaces and move
 *  its local rows into the personal one; then, per workspace, lease key
 *  blocks, push, and pull every page after that workspace's cursor. Without
 *  them, the cycle of before: one cursor for the account. A server that
 *  lists `stable-steps` then takes the test cases held back so far (DAT-02),
 *  and one with `append-only` the audit events and case revisions (AUD-01).
 *  A workspace the account lost is announced (`pharos:workspaces-revoked`)
 *  and skipped; its copy stays until the user confirms. Throws on
 *  network/auth/version errors (after retries); callers toast. */
export async function syncNow(): Promise<SyncResult> {
  if (!isTauri()) throw new Error("sync-desktop-only");
  // Token and user from one read: never push one account's changes with
  // another account's token (FIX-07).
  const session = await getSession();
  if (!session) throw new Error("not-authenticated");
  const { userId } = session;
  const request = sessionRequester(session);
  const invoke = platformInvoke;

  // Workspaces first, from a server that listed them in an earlier answer:
  // the mirror, and the account's rows in its personal workspace, before
  // anything is pushed. Until then (the first sync with it) the cycle of
  // before runs, in the personal workspace.
  const knowsWorkspaces = (await invoke<boolean | undefined>("sync_server_lists", { userId, feature: "workspaces" })) === true;
  const listed = knowsWorkspaces ? await fetchWorkspaces(request) : null;
  let route: WorkspaceRoute | undefined;
  const revoked: RevokedWorkspace[] = [];
  if (listed) {
    const applied = await invoke<{ revoked: RevokedWorkspace[]; remapped: number }>("workspaces_apply", {
      userId,
      workspaces: listed,
    });
    revoked.push(...applied.revoked);
    const personal = listed.find((w) => w.kind === "personal")?.id;
    if (personal) {
      route = {
        personal,
        ids: new Set(listed.map((w) => w.id)),
        ofProject: await invoke<Record<string, string>>("project_workspaces", { userId }),
      };
    }
    window.dispatchEvent(new CustomEvent("pharos:workspaces"));
  }

  // Key blocks first (DAT-01): provisional keys get their definitive one
  // before the push, so it carries them.
  await leaseKeyBlocks(request, userId, invoke, route);

  // Push.
  let { pushed, conflicts, skipped } = await pushLww(request, userId, invoke, route);

  // Pull: one cursor per workspace (or one for the account). The cursors
  // live in the local DB (wiped with the data), so an empty DB re-pulls
  // everything.
  let serverFeatures: string[] = [];
  let pulled = 0;
  const scopes: (string | undefined)[] = route ? [...route.ids] : [undefined];
  for (const ws of scopes) {
    const scope = { userId, workspaceId: ws ?? null };
    try {
      const cursor = await invoke<string>("sync_cursor_get", scope);
      pulled += await pullPages(
        request,
        cursor,
        async (page) => {
          serverFeatures = page.features ?? serverFeatures;
          if (page.docs.length > 0) {
            await invoke("apply_remote", { ...scope, docs: page.docs });
          }
          await invoke("sync_cursor_set", { ...scope, value: String(page.cursor) });
        },
        ws,
      );
    } catch (e) {
      if (!lostWorkspace(e) || !ws) throw e;
      const name = listed?.find((w) => w.id === ws)?.name ?? ws;
      revoked.push({ id: ws, name, projects: 0, pending: 0 });
    }
  }
  // What the server can take decides what goes next time, and now.
  await invoke("sync_server_features_set", {
    userId,
    features: serverFeatures,
  });
  // Contents pulled documents name and this device lacks (SYNC-04b).
  if (route && serverFeatures.includes("blobs")) {
    for (const ws of route.ids) await transferBlobs(invoke, userId, ws, "download");
  }
  // Test cases held back until the server listed `stable-steps` (DAT-02, the
  // first sync after an upgrade) go now, and custom field definitions held
  // back until it listed `custom-fields` (FLD-01; such a server also lists
  // `stable-steps`); usually nothing is left to send.
  if (serverFeatures.includes("stable-steps")) {
    const late = await pushLww(request, userId, invoke, route);
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
      await pushAppendOnly(request, userId, invoke, route);
    } catch (e) {
      logSyncFailure(e, "audit-push");
    }
  }
  if (revoked.length > 0) {
    window.dispatchEvent(new CustomEvent("pharos:workspaces-revoked", { detail: { workspaces: revoked } }));
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

/** A change the server refused without storing it (SYNC-07, ADR-0042 §2):
 *  the role does not allow it, or the item is in a workspace the account
 *  left. Desktop only; it waits until the person discards it. */
export interface Rejection {
  id: string;
  entity: string;
  entityId: string;
  reason: "forbidden" | "not_found";
  workspaceId: string | null;
  detectedAt: string;
}

/** Open refusals of the signed-in account (none on the web). */
export async function listRejections(): Promise<Rejection[]> {
  const session = await getSession();
  if (!session || !isTauri()) return [];
  return platformInvoke<Rejection[]>("sync_rejections_list", { userId: session.userId });
}

/** Drops the refused change for good: the server's version comes back on
 *  the next sync. */
export async function discardRejection(id: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("not-authenticated");
  await platformInvoke("sync_rejection_discard", { userId: session.userId, id });
  window.dispatchEvent(new CustomEvent("pharos:synced"));
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
  Assert<Covers<Contract.Rejection, Rejection>>,
];
