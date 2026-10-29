// The web's client of the server's domain API (BASE-10, ADR-0004). In a plain
// browser there is no local store: every module API reads and writes through
// these calls, and the server applies the domain rules. Nothing is kept in
// localStorage.
//
// - Edits never overwrite blindly (FIX-04): each write names the revision of
//   the item as this page last saw it. If it changed elsewhere meanwhile, the
//   server answers 409 with its version; the user is told, the form keeps the
//   edit, and saving again replaces the newer version knowingly.
// - Refusals the user can act on (a key already used, a key of a deleted
//   item, an invalid key, a desktop-only feature) are shown as a toast and
//   thrown as `ReportedError`, so callers do not report them twice.

import i18n from "i18next";
import { getSession } from "@modules/auth";
import { DesktopOnlyError, type capabilities } from "@shared/platform";
import { notify, ReportedError } from "@shared/ui/notify";
import { SyncHttpError, syncRequest } from "../api/transport";

/** Revision of each item as this page last read or wrote it (by id). */
const seen = new Map<string, number>();

/** Notes the revision of every `{ id, revision }` in an answer. */
function remember(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(remember);
  } else if (value && typeof value === "object") {
    const { id, revision } = value as { id?: unknown; revision?: unknown };
    if (typeof id === "string" && typeof revision === "number") seen.set(id, revision);
  }
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

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const session = await getSession();
  if (!session) throw new Error("not-authenticated");
  try {
    const answer = await syncRequest<T>(path, session.accessToken, { method, body });
    remember(answer);
    return answer;
  } catch (e) {
    throw reported(e);
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
  /** Updates item `id` from the revision this page last saw. */
  put: <T>(path: string, id: string, input: unknown) =>
    request<T>("PUT", path, { input, revision: seen.get(id) }),
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
  seen.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("pharos:signed-out", forgetSeenRevisions);
}
