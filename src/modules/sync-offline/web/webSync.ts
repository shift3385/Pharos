// Web sync client (spec §9 cross-cutting): in a plain browser (no Rust/local DB)
// the domain APIs read from and write to the backend document store, so the web
// shows the same data as the desktop. Reads hydrate the existing localStorage
// caches from a full pull; writes push a delta (fire-and-forget). The desktop is
// unaffected (it keeps its Rust store + real sync).

import { getAccessToken } from "@modules/auth";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export interface RemoteDoc {
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  revision: number;
  author: string;
  deleted: boolean;
}

/** localStorage cache key per synced entity (same shape the fallbacks use). */
const KEYS: Record<string, string> = {
  project: "pharos.projects",
  test_plan: "pharos.testPlans",
  test_case: "pharos.testCases",
};

async function authHeader(): Promise<Record<string, string> | null> {
  const token = await getAccessToken();
  return token ? { authorization: `Bearer ${token}` } : null;
}

/** Pulls every document for the signed-in user (full pull, no browser cursor). */
export async function webPull(): Promise<RemoteDoc[]> {
  const h = await authHeader();
  if (!h) return [];
  const res = await fetch(`${API_URL}/sync/pull?since=0`, { headers: h });
  if (!res.ok) throw new Error(`pull ${res.status}`);
  const body = (await res.json()) as { docs?: RemoteDoc[] };
  return body.docs ?? [];
}

/** Pushes a single delta. Best-effort: callers fire-and-forget so a failure
 *  leaves the change in the local cache (kept by the merge on the next pull). */
export async function webPush(
  entity: string,
  entityId: string,
  op: "upsert" | "delete",
  payload: object,
  revision: number,
  author: string,
): Promise<void> {
  const h = await authHeader();
  if (!h) return;
  const res = await fetch(`${API_URL}/sync/push`, {
    method: "POST",
    headers: { "content-type": "application/json", ...h },
    body: JSON.stringify({ deltas: [{ entity, entityId, op, payload, revision, author }] }),
  });
  if (!res.ok) throw new Error(`push ${res.status}`);
}

/** Fire-and-forget push used inside the browser write fallbacks. */
export function pushEntity(
  entity: string,
  entityId: string,
  op: "upsert" | "delete",
  payload: object,
  revision: number,
  author: string,
): void {
  if (isTauri()) return;
  void webPush(entity, entityId, op, payload, revision, author).catch((e) =>
    console.warn("[web push] failed:", e),
  );
}

interface Row {
  id: string;
  revision?: number;
}

/** Merges remote docs into a localStorage cache by id, last-write-wins by
 *  revision, keeping local-only rows (e.g. a write whose push has not landed). */
function mergeInto(key: string, remote: RemoteDoc[]) {
  let local: Row[] = [];
  try {
    local = JSON.parse(localStorage.getItem(key) ?? "[]") as Row[];
  } catch {
    /* ignore */
  }
  const byId = new Map<string, Row>(local.map((x) => [x.id, x]));
  for (const d of remote) {
    if (d.deleted) {
      byId.delete(d.entityId);
      continue;
    }
    const existing = byId.get(d.entityId);
    if (!existing || d.revision >= (existing.revision ?? 0)) {
      byId.set(d.entityId, d.payload as unknown as Row);
    }
  }
  localStorage.setItem(key, JSON.stringify([...byId.values()]));
}

/** Hydrates the browser caches from the backend (full pull). No-op on desktop.
 *  Returns the number of documents pulled. */
export async function hydrateFromBackend(): Promise<number> {
  if (isTauri()) return 0;
  const docs = await webPull();
  const byEntity: Record<string, RemoteDoc[]> = {};
  for (const d of docs) (byEntity[d.entity] ??= []).push(d);
  for (const [entity, key] of Object.entries(KEYS)) mergeInto(key, byEntity[entity] ?? []);
  window.dispatchEvent(new CustomEvent("pharos:synced"));
  return docs.length;
}
