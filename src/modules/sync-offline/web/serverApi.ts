// The web's client of the server's domain API (BASE-10, ADR-0004). In a plain
// browser there is no local store: every module API reads and writes through
// these calls, and the server applies the domain rules. Nothing is kept in
// localStorage.
//
// - Edits never overwrite blindly (FIX-04): each write names the revision of
//   the item as this page last saw it. If it changed elsewhere meanwhile, the
//   server answers 409 with its version. Since SYNC-02 (ADR-0051) the edit is
//   first merged field by field with that version, over the item as this page
//   read it: when no field collides it is saved again on top of it, and the
//   user is told it was combined. Otherwise the user is told, the form keeps
//   the edit, and saving again replaces the newer version knowingly.
// - Refusals the user can act on (a key already used, a key of a deleted
//   item, an invalid key, a desktop-only feature) are shown as a toast and
//   thrown as `ReportedError`, so callers do not report them twice.

import i18n from "i18next";
import { getSession, renewSession } from "@modules/auth";
import { DesktopOnlyError, type capabilities } from "@shared/platform";
import { notify, ReportedError } from "@shared/ui/notify";
import { SyncHttpError, syncRequest } from "../api/transport";
import { merge, type Payload } from "../domain/merge";
import type { MergeConflictKey } from "../domain/conflict";
import { askFieldChoices, type FieldChoices } from "./mergePrompt";

/** Revision of each item as this page last read or wrote it (by id). */
const seen = new Map<string, number>();
/** The item itself, as this page last read or wrote it: the base of a
 *  field-level merge when a write meets a newer version (SYNC-02). */
const seenItems = new Map<string, Payload>();

/** Notes the revision of every `{ id, revision }` in an answer. */
function remember(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(remember);
  } else if (value && typeof value === "object") {
    const { id, revision } = value as { id?: unknown; revision?: unknown };
    if (typeof id === "string" && typeof revision === "number") {
      seen.set(id, revision);
      seenItems.set(id, value as Payload);
    }
  }
}

/** The synced entity behind a domain route (`/api/test-cases/…`). */
const ENTITY_OF: Record<string, string> = {
  projects: "project",
  "test-plans": "test_plan",
  "test-cases": "test_case",
  requirements: "requirement",
  "planner-cards": "planner_card",
  defects: "defect",
  cycles: "test_cycle",
  configurations: "configuration",
  "custom-fields": "custom_field",
  runs: "run",
};

const isObject = (v: unknown): v is Payload => v !== null && typeof v === "object" && !Array.isArray(v);

/** The edit merged field by field with the server's newer version, over the
 *  item as this page read it (SYNC-02, ADR-0051): only the keys the edit
 *  sends. `conflict` lists the keys that collide (the person chooses, then
 *  this runs again with `choices`); null when it cannot merge at all: an
 *  unknown route, an item never read here, or a guard (an approval against
 *  new content). */
export function mergeStaleEdit(
  path: string,
  base: unknown,
  input: unknown,
  current: unknown,
  choices: FieldChoices = {},
):
  | { kind: "merged"; input: Payload }
  | { kind: "conflict"; conflicts: MergeConflictKey[]; origins: Record<string, string> }
  | null {
  const entity = ENTITY_OF[path.split("/")[2] ?? ""];
  if (!entity || !isObject(base) || !isObject(input) || !isObject(current)) return null;
  const keys = Object.keys(input);
  if (keys.some((k) => !(k in base))) return null;
  const pick = (o: Payload) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
  const out = merge(entity, pick(base), input, pick(current), choices);
  if (out.kind === "conflict") return { kind: "conflict", conflicts: out.conflicts, origins: out.origins };
  if (out.kind !== "merged") return null;
  return { kind: "merged", input: Object.fromEntries(keys.filter((k) => k in out.merged).map((k) => [k, out.merged[k]])) };
}

/** Server refusals shown to the user, by error code. */
const TOASTS: Record<string, string> = {
  stale_write: "sync.web.staleWrite",
  // Nothing to replace: saving again would only repeat it.
  deleted_elsewhere: "sync.web.deletedElsewhere",
  key_taken: "sync.web.keyTaken",
  key_retired: "sync.web.keyRetired",
  invalid_key: "sync.web.invalidKey",
};

function reported(e: unknown): unknown {
  if (!(e instanceof SyncHttpError)) return e;
  const key = TOASTS[e.code];
  if (!key) return e;
  // A newer version exists: saving again replaces it on purpose.
  if (e.code === "stale_write") remember(e.body.current);
  const message = i18n.t(key);
  notify(message, "warning");
  return new ReportedError(message);
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function send<T>(method: Method, path: string, token: string, body?: unknown, quietStale = false): Promise<T> {
  try {
    const answer = await syncRequest<T>(path, token, { method, body });
    remember(answer);
    return answer;
  } catch (e) {
    // The caller merges a stale write first and reports it only if it cannot.
    if (quietStale && e instanceof SyncHttpError && e.code === "stale_write") throw e;
    throw reported(e);
  }
}

/** A token that expired while the page was open is renewed and the request
 *  repeated once. A 401 comes before the server looks at the request, so even
 *  a write is safe to repeat. If the session is over, the 401 reaches the
 *  caller as any other failure while the app goes back to the sign-in screen. */
async function request<T>(method: Method, path: string, body?: unknown, quietStale = false): Promise<T> {
  const session = await getSession();
  if (!session) throw new Error("not-authenticated");
  try {
    return await send<T>(method, path, session.accessToken, body, quietStale);
  } catch (e) {
    if (!(e instanceof SyncHttpError) || e.status !== 401) throw e;
    const renewed = await renewSession(session.accessToken);
    // Never repeat a request under another account (FIX-07).
    if (renewed?.userId !== session.userId) throw e;
    return send<T>(method, path, renewed.accessToken, body, quietStale);
  }
}

const withRevision = (path: string, id: string) => {
  const revision = seen.get(id);
  return revision === undefined ? path : `${path}?revision=${revision}`;
};

export const serverApi = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  /** Updates item `id` from the revision this page last saw. If it changed
   *  elsewhere meanwhile, the edit is merged field by field with the newer
   *  version and saved on top of it; a field changed on both sides is the
   *  person's to choose (SYNC-02). */
  put: async <T>(path: string, id: string, input: unknown): Promise<T> => {
    const base = seenItems.get(id);
    try {
      return await request<T>("PUT", path, { input, revision: seen.get(id) }, true);
    } catch (e) {
      if (!(e instanceof SyncHttpError) || e.code !== "stale_write") throw e;
      const current: unknown = e.body.current;
      let merged = mergeStaleEdit(path, base, input, current);
      // The same field changed on both sides: the person chooses (boceto 3).
      if (merged?.kind === "conflict") {
        const choices = await askFieldChoices(merged.conflicts, merged.origins);
        merged = choices ? mergeStaleEdit(path, base, input, current, choices) : null;
      }
      if (merged?.kind !== "merged") throw reported(e);
      remember(current);
      const answer = await request<T>("PUT", path, { input: merged.input, revision: seen.get(id) });
      notify(i18n.t("sync.web.merged"), "success");
      return answer;
    }
  },
  /** Deletes item `id` if it is still the revision this page last saw. */
  remove: async (path: string, id: string): Promise<void> => {
    await request<void>("DELETE", withRevision(path, id));
    seen.delete(id);
  },
};

/** Tells the user a feature is only in the desktop app, and throws. */
export function desktopOnly(feature: keyof typeof capabilities): never {
  notify(i18n.t("sync.web.desktopOnly"), "warning");
  throw new DesktopOnlyError(feature);
}

/** Forgets the revisions seen (tests; and on sign-out, nothing stale stays). */
export function forgetSeenRevisions() {
  seenItems.clear();
  seen.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("pharos:signed-out", forgetSeenRevisions);
}
