// Web sync client (spec §9, ADR-0004): in a plain browser (no Rust/local DB)
// the domain APIs read from and write to the backend document store, so the web
// shows the same data as the desktop. Reads hydrate the localStorage caches
// from the backend; writes go through an outbox. The desktop is unaffected (it
// keeps its Rust store + real sync).
//
// - Outbox (FIX-04): every web write is queued per account and pushed in
//   batches; a failed push stays queued and is retried (timer, reconnect, next
//   write, "Sync now"), so no edit is dropped.
// - Conflicts (FIX-04): web deltas carry an HLC but no base, so the server
//   resolves them by last-write-wins (decision D1). If the web loses, its edit
//   is kept as a web conflict (both versions) and stays visible until the user
//   picks one in the conflict panel; it is never overwritten silently.
// - Pull (FIX-02): incremental from a per-account cursor, page by page.
// - Per account (FIX-07): outbox, conflicts and cursor are keyed by user id.

import { getSession } from "@modules/auth";
import { encodeHlc, parseHlc, recvHlc, tickHlc, type Hlc } from "../domain/hlc";
import type { ConflictResolution, SyncConflict } from "../domain/conflict";
import {
  batchDeltas,
  pullPages,
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
}

type WebConflict = SyncConflict & { author: string };

const DEVICE_KEY = "pharos.deviceId";
const HLC_KEY = "pharos.hlc";
const outboxKey = (userId: string) => `pharos.sync.outbox:${userId}`;
const conflictsKey = (userId: string) => `pharos.sync.conflicts:${userId}`;
const cursorKey = (userId: string) => `pharos.sync.cursor:${userId}`;

/** Wait before retrying a failed outbox flush. */
const RETRY_MS = 10_000;

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
 *  one (its payload is the full latest state). */
export function enqueue(userId: string, delta: WebDelta) {
  const outbox = loadOutbox(userId).filter(
    (d) => entityKey(d) !== entityKey(delta),
  );
  writeJson(outboxKey(userId), [...outbox, delta]);
  notify();
}

/** Records (or refreshes) the conflict between a web change the server
 *  rejected and the version the server keeps. */
function addConflict(userId: string, local: WebDelta, remote: RemoteDoc) {
  const all = webConflicts(userId);
  const existing = all.find((c) => entityKey(c) === entityKey(local));
  const side = (payload: object | null, revision: number, deleted: boolean, hlc: string) => ({
    payload: payload as Record<string, unknown> | null,
    revision,
    deleted,
    hlc,
  });
  const remoteSide = side(remote.payload, remote.revision, remote.deleted, remote.hlc);
  if (existing) {
    existing.remote = remoteSide;
  } else {
    all.push({
      id: crypto.randomUUID(),
      entity: local.entity,
      entityId: local.entityId,
      baseRevision: null,
      local: side(local.payload, local.revision, local.op === "delete", local.hlc),
      remote: remoteSide,
      detectedAt: new Date().toISOString(),
      author: local.author,
    });
  }
  writeJson(conflictsKey(userId), all);
}

let flushing: Promise<{ pushed: number; conflicts: number }> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushOutbox().catch(() => {
      /* scheduled again inside */
    });
  }, RETRY_MS);
}

/** Pushes the signed-in account's outbox in batches. Accepted deltas leave the
 *  outbox; rejected ones become web conflicts (the edit is kept); on failure
 *  the rest stays queued and a retry is scheduled. One flush at a time. */
export function flushOutbox(): Promise<{ pushed: number; conflicts: number }> {
  flushing ??= doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush(): Promise<{ pushed: number; conflicts: number }> {
  const session = await getSession();
  if (!session) return { pushed: 0, conflicts: 0 };
  const { accessToken: token, userId } = session;
  const queued = loadOutbox(userId);
  let pushed = 0;
  let conflicts = 0;
  let deletedProject = false;
  for (const batch of batchDeltas(queued)) {
    let body: { conflicts?: RemoteDoc[] };
    try {
      body = await withRetry(
        () =>
          syncRequest<{ conflicts?: RemoteDoc[] }>("/sync/push", token, {
            method: "POST",
            body: { deltas: batch },
          }),
        [500, 1500],
      );
    } catch (e) {
      scheduleRetry();
      notify();
      throw e;
    }
    const rejected = new Map((body.conflicts ?? []).map((c) => [entityKey(c), c]));
    // Drop what was sent, unless the entity was edited again meanwhile (its
    // newer delta has another HLC and stays queued).
    const sent = new Map(batch.map((d) => [entityKey(d), d.hlc]));
    writeJson(
      outboxKey(userId),
      loadOutbox(userId).filter((d) => sent.get(entityKey(d)) !== d.hlc),
    );
    for (const d of batch) {
      const remote = rejected.get(entityKey(d));
      if (remote) {
        observeHlc(remote.hlc);
        addConflict(userId, d, remote);
        conflicts++;
      } else {
        pushed++;
        if (d.entity === "project" && d.op === "delete") deletedProject = true;
      }
    }
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  notify();
  if (conflicts > 0) {
    window.dispatchEvent(
      new CustomEvent("pharos:sync-conflict", { detail: { count: conflicts } }),
    );
  }
  // The server cascaded the project's children (FIX-05): pull their tombstones.
  if (deletedProject) void pullInto(session).catch(() => {});
  return { pushed, conflicts };
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

/** Entities whose web edit must not be replaced by a pull. */
function heldKeys(userId: string): Set<string> {
  return new Set([
    ...loadOutbox(userId).map(entityKey),
    ...webConflicts(userId).map(entityKey),
  ]);
}

/** The account's pull cursor. If every cache is empty (site data cleared) it
 *  restarts at 0, so the caches are rebuilt instead of staying empty. */
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
  const pulled = await pullPages(token, loadCursor(userId), (page) => {
    const held = heldKeys(userId);
    const byEntity: Record<string, RemoteDoc[]> = {};
    for (const d of page.docs) {
      observeHlc(d.hlc);
      (byEntity[d.entity] ??= []).push(d);
    }
    for (const [entity, docs] of Object.entries(byEntity))
      mergeInto(entity, docs, held);
    writeJson(cursorKey(userId), String(page.cursor));
  });
  if (pulled > 0) window.dispatchEvent(new CustomEvent("pharos:synced"));
  return pulled;
}

/** Web sync cycle: push the outbox, then pull changes since the cursor into
 *  the browser caches. No-op on desktop. Throws on network/auth/version
 *  errors (the outbox keeps its deltas). */
export async function hydrateFromBackend(): Promise<SyncResult> {
  if (isTauri()) return { pushed: 0, pulled: 0, conflicts: 0 };
  const session = await getSession();
  if (!session) return { pushed: 0, pulled: 0, conflicts: 0 };
  const { pushed, conflicts } = await flushOutbox();
  const pulled = await pullInto(session);
  return { pushed, pulled, conflicts };
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
