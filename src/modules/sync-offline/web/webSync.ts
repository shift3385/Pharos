// Web sync client (spec §9, ADR-0004): in a plain browser (no Rust/local DB)
// the domain APIs read from and write to the backend document store, so the web
// shows the same data as the desktop. Reads hydrate the localStorage caches
// from the backend; writes go through an outbox. The desktop is unaffected (it
// keeps its Rust store + real sync).
//
// - Outbox (FIX-04): every web write is queued per account and pushed in
//   batches. A push that fails for a transient reason stays queued and is
//   retried (timer, reconnect, next write, "Sync now"); a delta the server
//   refuses for its content is flagged and does not block the others.
// - Conflicts (FIX-04): web deltas carry an HLC but no base, so the server
//   resolves them by last-write-wins (decision D1). If the web loses, its edit
//   is kept as a web conflict (both versions) and stays visible until the user
//   picks one in the conflict panel; it is never overwritten silently. Later
//   pulls keep the conflict's server side up to date.
// - Pull (FIX-02): incremental from a per-account cursor, page by page.
// - Per account (FIX-07): outbox, conflicts and cursor are keyed by user id,
//   and the caches are emptied on sign-out and when another account syncs.

import { getSession } from "@modules/auth";
import { encodeHlc, parseHlc, recvHlc, tickHlc, type Hlc } from "../domain/hlc";
import type { ConflictResolution, SyncConflict } from "../domain/conflict";
import {
  batchDeltas,
  isTransient,
  pullPages,
  sendIsolating,
  syncRequest,
  withRetry,
  type RemoteDoc,
} from "../api/transport";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export type { RemoteDoc };

/** Outcome of one sync cycle (desktop or web). */
export interface SyncResult {
  pushed: number;
  pulled: number;
  /** Deltas the server rejected in this cycle (now open conflicts). */
  conflicts: number;
  /** Deltas the server refused for their content (too large, invalid); they
   *  stay pending and are reported to the user. */
  skipped: number;
}

/** A web change waiting in the outbox (one per entity: the latest wins). */
export interface WebDelta {
  entity: string;
  entityId: string;
  op: "upsert" | "delete";
  payload: object;
  revision: number;
  author: string;
  hlc: string;
  /** Set when the server refused this delta for its content (too large,
   *  invalid): it stays queued and visible, but is not sent again until the
   *  entity is edited. */
  refused?: boolean;
}

type WebConflict = SyncConflict & { author: string };

const DEVICE_KEY = "pharos.deviceId";
const HLC_KEY = "pharos.hlc";
/** Account whose server data the caches hold (FIX-07). */
const CACHE_OWNER_KEY = "pharos.sync.cacheOwner";
const outboxKey = (userId: string) => `pharos.sync.outbox:${userId}`;
const conflictsKey = (userId: string) => `pharos.sync.conflicts:${userId}`;
const cursorKey = (userId: string) => `pharos.sync.cursor:${userId}`;

/** Wait before retrying a transient outbox failure. */
const RETRY_MS = 10_000;
/** Flush rounds while new writes keep arriving during a flush. */
const MAX_FLUSH_ROUNDS = 5;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Tells the indicator the web pending/conflict counts changed. */
function notify() {
  window.dispatchEvent(new CustomEvent("pharos:sync-state"));
}

/** This browser's device id (HLC tie-break), created on first use. */
function webDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "web";
  }
}

function lastHlc(): Hlc | null {
  try {
    return parseHlc(localStorage.getItem(HLC_KEY) ?? "");
  } catch {
    return null;
  }
}

function saveHlc(h: Hlc): string {
  const s = encodeHlc(h);
  try {
    localStorage.setItem(HLC_KEY, s);
  } catch {
    /* ignore: the clock still moves forward within this page */
  }
  return s;
}

/** HLC for a web change (same clock as the desktop's oplog). */
export function nextWebHlc(): string {
  return saveHlc(tickHlc(lastHlc(), Date.now(), webDeviceId()));
}

/** Merges a pulled document's HLC into the web clock. */
function observeHlc(remote: string | undefined) {
  const h = parseHlc(remote ?? "");
  if (h) saveHlc(recvHlc(lastHlc(), h, Date.now(), webDeviceId()));
}

/** localStorage cache key per synced entity (same shape the fallbacks use). */
const KEYS: Record<string, string> = {
  project: "pharos.projects",
  test_plan: "pharos.testPlans",
  test_case: "pharos.testCases",
  requirement: "pharos.requirements",
  planner_card: "pharos.plannerCards",
};

/** Caches that keep deleted rows (with `deletedAt`): a requirement key is
 *  never reused, so the numbering must still see it. */
const KEEPS_TOMBSTONES = new Set(["requirement"]);

const entityKey = (d: { entity: string; entityId: string }) =>
  `${d.entity}:${d.entityId}`;

export function loadOutbox(userId: string): WebDelta[] {
  return readJson<WebDelta[]>(outboxKey(userId), []);
}

export function webConflicts(userId: string): WebConflict[] {
  return readJson<WebConflict[]>(conflictsKey(userId), []);
}

/** Web pending changes (queued deltas) and open web conflicts. */
export function webLocalState(userId: string): {
  pending: number;
  conflicts: number;
} {
  return {
    pending: loadOutbox(userId).length,
    conflicts: webConflicts(userId).length,
  };
}

/** Queues a web change; a newer change of the same entity replaces the queued
 *  one (its payload is the full latest state), refused or not. */
export function enqueue(userId: string, delta: WebDelta) {
  const outbox = loadOutbox(userId).filter(
    (d) => entityKey(d) !== entityKey(delta),
  );
  writeJson(outboxKey(userId), [...outbox, delta]);
  notify();
}

type Side = SyncConflict["remote"];

const sideOf = (doc: RemoteDoc): Side => ({
  payload: doc.payload,
  revision: doc.revision,
  deleted: doc.deleted,
  hlc: doc.hlc,
});

/** Records (or refreshes) the conflict between a web change the server
 *  rejected and the version the server keeps. */
function addConflict(userId: string, local: WebDelta, remote: RemoteDoc) {
  const all = webConflicts(userId);
  const existing = all.find((c) => entityKey(c) === entityKey(local));
  if (existing) {
    existing.remote = sideOf(remote);
  } else {
    all.push({
      id: crypto.randomUUID(),
      entity: local.entity,
      entityId: local.entityId,
      baseRevision: null,
      local: {
        payload: local.payload as Record<string, unknown>,
        revision: local.revision,
        deleted: local.op === "delete",
        hlc: local.hlc,
      },
      remote: sideOf(remote),
      detectedAt: new Date().toISOString(),
      author: local.author,
    });
  }
  writeJson(conflictsKey(userId), all);
}

/** A pulled document of an entity in conflict is the server's newest version:
 *  the conflict's server side follows it, so neither choice in the panel acts
 *  on a stale copy. Returns the conflicted entity keys. */
function refreshConflicts(userId: string, docs: RemoteDoc[]): Set<string> {
  const all = webConflicts(userId);
  const open = new Map(all.map((c) => [entityKey(c), c]));
  let changed = false;
  for (const d of docs) {
    const c = open.get(entityKey(d));
    if (c && d.hlc !== c.remote.hlc) {
      c.remote = sideOf(d);
      changed = true;
    }
  }
  if (changed) writeJson(conflictsKey(userId), all);
  return new Set(open.keys());
}

let flushing: Promise<FlushResult> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

interface FlushResult {
  pushed: number;
  conflicts: number;
  skipped: number;
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushOutbox().catch(() => {
      /* scheduled again inside when transient */
    });
  }, RETRY_MS);
}

/** Pushes the signed-in account's outbox in batches. Accepted deltas leave the
 *  outbox; rejected ones become web conflicts (the edit is kept); deltas the
 *  server refuses for their content are flagged and stay queued. A transient
 *  failure schedules a retry; auth/version errors stop and are thrown. One
 *  flush at a time; it repeats while writes arrive meanwhile. */
export function flushOutbox(): Promise<FlushResult> {
  flushing ??= doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** What `/sync/push` answers: conflicts, and keys already used (DAT-01). */
interface PushBody {
  conflicts?: RemoteDoc[];
  keyConflicts?: { entity: string; entityId: string }[];
}

async function doFlush(): Promise<FlushResult> {
  const session = await getSession();
  const total: FlushResult = { pushed: 0, conflicts: 0, skipped: 0 };
  if (!session) return total;
  const { accessToken: token, userId } = session;
  let deletedProject = false;
  // Entries already tried in this flush (by entity + HLC): a refused one is not
  // sent again until it is edited.
  const tried = new Set<string>();
  const send = (part: WebDelta[]) =>
    withRetry(
      () =>
        syncRequest<PushBody>("/sync/push", token, {
          method: "POST",
          body: { deltas: part.map(({ refused: _r, ...d }) => d) },
        }),
      [500, 1500],
    );
  const settle = (part: WebDelta[], body: PushBody) => {
    const rejected = new Map(
      (body.conflicts ?? []).map((c) => [entityKey(c), c]),
    );
    // A key another document of the project already has (DAT-01): kept
    // queued and flagged like a delta refused for its content.
    const keyTaken = new Set((body.keyConflicts ?? []).map(entityKey));
    // Drop what was sent, unless the entity was edited again meanwhile (its
    // newer delta has another HLC and stays queued).
    const sent = new Map(part.map((d) => [entityKey(d), d.hlc]));
    writeJson(
      outboxKey(userId),
      loadOutbox(userId)
        .filter(
          (d) => sent.get(entityKey(d)) !== d.hlc || keyTaken.has(entityKey(d)),
        )
        .map((d) =>
          keyTaken.has(entityKey(d)) && sent.get(entityKey(d)) === d.hlc
            ? { ...d, refused: true }
            : d,
        ),
    );
    for (const d of part) {
      const remote = rejected.get(entityKey(d));
      if (keyTaken.has(entityKey(d))) {
        total.skipped++;
        console.warn("[web push] key already used", d.entity, d.entityId);
      } else if (remote) {
        observeHlc(remote.hlc);
        addConflict(userId, d, remote);
        total.conflicts++;
      } else {
        total.pushed++;
        if (d.entity === "project" && d.op === "delete") deletedProject = true;
      }
    }
  };

  for (let round = 0; round < MAX_FLUSH_ROUNDS; round++) {
    const queue = loadOutbox(userId).filter(
      (d) => !d.refused && !tried.has(`${entityKey(d)}@${d.hlc}`),
    );
    if (queue.length === 0) break;
    for (const d of queue) tried.add(`${entityKey(d)}@${d.hlc}`);
    for (const batch of batchDeltas(queue)) {
      let refused: WebDelta[];
      try {
        refused = await sendIsolating(batch, send, settle);
      } catch (e) {
        if (isTransient(e)) scheduleRetry();
        notify();
        throw e;
      }
      if (refused.length > 0) {
        const status = new Map(refused.map((d) => [entityKey(d), d.hlc]));
        writeJson(
          outboxKey(userId),
          loadOutbox(userId).map((d) =>
            status.get(entityKey(d)) === d.hlc ? { ...d, refused: true } : d,
          ),
        );
        total.skipped += refused.length;
        for (const d of refused)
          console.warn("[web push] the server refused", d.entity, d.entityId);
      }
    }
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  notify();
  if (total.conflicts > 0) {
    window.dispatchEvent(
      new CustomEvent("pharos:sync-conflict", {
        detail: { count: total.conflicts },
      }),
    );
  }
  if (total.skipped > 0) {
    window.dispatchEvent(
      new CustomEvent("pharos:sync-skipped", {
        detail: { count: total.skipped },
      }),
    );
  }
  // The server cascaded the project's children (FIX-05): pull their tombstones.
  if (deletedProject) void pullInto(session).catch(() => {});
  return total;
}

/** Queues a web write and pushes it right away (fire-and-forget). Used inside
 *  the browser write fallbacks; no-op on desktop (it has the oplog). */
export function pushEntity(
  entity: string,
  entityId: string,
  op: "upsert" | "delete",
  payload: object,
  revision: number,
  author: string,
): void {
  if (isTauri()) return;
  void (async () => {
    const session = await getSession();
    if (!session) return;
    enqueue(session.userId, {
      entity,
      entityId,
      op,
      payload,
      revision,
      author,
      hlc: nextWebHlc(),
    });
    await flushOutbox();
  })().catch((e) => console.warn("[web push] queued, will retry:", e));
}

interface Row {
  id: string;
  revision?: number;
  deletedAt?: string;
  ownerId?: string;
  projectId?: string;
}

/** Merges remote docs into a localStorage cache by id. The server copy wins,
 *  except for entities held locally (queued in the outbox or in an open
 *  conflict): their web edit stays visible until it is pushed or resolved. */
function mergeInto(
  entity: string,
  remote: RemoteDoc[],
  held: Set<string> = new Set(),
) {
  const key = KEYS[entity];
  if (!key || remote.length === 0) return;
  const local = readJson<Row[]>(key, []);
  const byId = new Map<string, Row>(local.map((x) => [x.id, x]));
  for (const d of remote) {
    if (held.has(entityKey(d))) continue;
    if (d.deleted) {
      const existing = byId.get(d.entityId);
      if (KEEPS_TOMBSTONES.has(entity) && existing) {
        byId.set(d.entityId, {
          ...existing,
          deletedAt: existing.deletedAt ?? new Date().toISOString(),
        });
      } else {
        byId.delete(d.entityId);
      }
      continue;
    }
    byId.set(d.entityId, d.payload as unknown as Row);
  }
  writeJson(key, [...byId.values()]);
}

/** Empties the browser caches of server data (not the outbox nor the
 *  conflicts, which keep each account's unsent work). */
export function clearWebCaches() {
  for (const key of Object.values(KEYS)) localStorage.removeItem(key);
  localStorage.removeItem(CACHE_OWNER_KEY);
}

/** Caches hold one account's data (FIX-07). When another account syncs they
 *  are emptied first. Returns true when the caches were adopted from before
 *  this version (no owner recorded), to rescue unsent rows after the pull. */
function claimCaches(userId: string): boolean {
  const owner = localStorage.getItem(CACHE_OWNER_KEY);
  if (owner && owner !== userId) clearWebCaches();
  localStorage.setItem(CACHE_OWNER_KEY, userId);
  return owner === null;
}

/** Before this version a web write whose push failed lived only in the cache.
 *  After the first full pull, rows of this account that the server does not
 *  have are queued, so they are pushed instead of lost. */
function rescueUnsent(userId: string, onServer: Set<string>) {
  const projects = readJson<Row[]>(KEYS.project, []);
  const mine = new Set(
    projects.filter((p) => p.ownerId === userId).map((p) => p.id),
  );
  for (const [entity, key] of Object.entries(KEYS)) {
    for (const row of readJson<Row[]>(key, [])) {
      if (row.deletedAt || onServer.has(`${entity}:${row.id}`)) continue;
      const owned =
        entity === "project"
          ? row.ownerId === userId
          : row.projectId !== undefined && mine.has(row.projectId);
      if (!owned) continue;
      enqueue(userId, {
        entity,
        entityId: row.id,
        op: "upsert",
        payload: row,
        revision: row.revision ?? 1,
        author: "",
        hlc: nextWebHlc(),
      });
    }
  }
}

/** Entities whose web edit must not be replaced by a pull. */
function heldKeys(userId: string, conflicted: Set<string>): Set<string> {
  return new Set([...loadOutbox(userId).map(entityKey), ...conflicted]);
}

/** The account's pull cursor. If every cache is empty (site data cleared,
 *  another account) it restarts at 0, so the caches are rebuilt. */
function loadCursor(userId: string): string {
  const cursor = readJson<string>(cursorKey(userId), "0");
  const empty = Object.values(KEYS).every(
    (k) => readJson<unknown[]>(k, []).length === 0,
  );
  return empty ? "0" : cursor;
}

/** Pulls every page after the account's cursor into the caches. */
async function pullInto(session: {
  accessToken: string;
  userId: string;
}): Promise<number> {
  const { accessToken: token, userId } = session;
  const adopted = claimCaches(userId);
  const since = loadCursor(userId);
  const seen = new Set<string>();
  const pulled = await pullPages(token, since, (page) => {
    const conflicted = refreshConflicts(userId, page.docs);
    const held = heldKeys(userId, conflicted);
    const byEntity: Record<string, RemoteDoc[]> = {};
    for (const d of page.docs) {
      observeHlc(d.hlc);
      seen.add(entityKey(d));
      (byEntity[d.entity] ??= []).push(d);
    }
    for (const [entity, docs] of Object.entries(byEntity))
      mergeInto(entity, docs, held);
    writeJson(cursorKey(userId), String(page.cursor));
  });
  if (adopted && since === "0") {
    rescueUnsent(userId, seen);
    if (loadOutbox(userId).length > 0) void flushOutbox().catch(() => {});
  }
  if (pulled > 0) window.dispatchEvent(new CustomEvent("pharos:synced"));
  return pulled;
}

/** Web sync cycle: push the outbox, then pull changes since the cursor into
 *  the browser caches. No-op on desktop. Throws on network/auth/version
 *  errors (the outbox keeps its deltas). */
export async function hydrateFromBackend(): Promise<SyncResult> {
  const none = { pushed: 0, pulled: 0, conflicts: 0, skipped: 0 };
  if (isTauri()) return none;
  const session = await getSession();
  if (!session) return none;
  const { pushed, conflicts, skipped } = await flushOutbox();
  const pulled = await pullInto(session);
  return { pushed, pulled, conflicts, skipped };
}

/** Resolves a web conflict for the whole entity. `local` pushes the web
 *  version again with a newer HLC (it then wins last-write-wins); `remote`
 *  takes the server version into the cache. */
export async function resolveWebConflict(
  userId: string,
  id: string,
  resolution: ConflictResolution,
): Promise<void> {
  const all = webConflicts(userId);
  const c = all.find((x) => x.id === id);
  if (!c) throw new Error("conflict not found");
  writeJson(
    conflictsKey(userId),
    all.filter((x) => x.id !== id),
  );
  if (resolution === "local") {
    observeHlc(c.remote.hlc);
    enqueue(userId, {
      entity: c.entity,
      entityId: c.entityId,
      op: c.local.deleted ? "delete" : "upsert",
      payload: c.local.payload ?? { id: c.entityId },
      revision: c.remote.revision + 1,
      author: c.author,
      hlc: nextWebHlc(),
    });
    await flushOutbox().catch(() => {
      /* stays queued; retried */
    });
  } else {
    mergeInto(c.entity, [
      {
        entity: c.entity,
        entityId: c.entityId,
        payload: c.remote.payload ?? {},
        revision: c.remote.revision,
        deleted: c.remote.deleted,
        hlc: c.remote.hlc,
      },
    ]);
  }
  notify();
}

// Signing out empties the caches, so the next account never sees them.
if (typeof window !== "undefined" && !isTauri()) {
  window.addEventListener("pharos:signed-out", clearWebCaches);
}
