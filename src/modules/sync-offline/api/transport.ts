// HTTP transport shared by the desktop sync client and the web's server
// client (spec §9, BASE-10). Every
// request carries the app version (SYNC-08); pushes go in batches small enough
// for the server's body limit (FIX-03); transient failures are retried.

import { APP_VERSION } from "@shared/version";

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:3000";

/** Header with the app version; the server rejects unsupported ones (426). */
export const VERSION_HEADER = "x-pharos-version";

/** Sync features this client understands. `key-conflicts` (DAT-01): it reads
 *  `keyConflicts` in the push answer. A client without it gets 426 instead
 *  of a refusal it would mistake for an accepted delta. */
export const FEATURES_HEADER = "x-pharos-sync-features";
export const SYNC_FEATURES = "key-conflicts";

/** The app version, from its single source (`@shared/version`, UX-07). */
export { APP_VERSION };

/** Most deltas per push request and target size of one request body (the
 *  server accepts 500 deltas per push and, on /sync/*, bodies up to
 *  SYNC_BODY_LIMIT_BYTES: 8 MiB by default). */
export const MAX_BATCH_DELTAS = 200;
export const MAX_BATCH_BYTES = 512 * 1024;

/** A failed sync request. `code` is the server's machine-readable code when
 *  it sent one (e.g. `unsupported_client_version`); `body` is the whole error
 *  body (e.g. the server's current version of an item on a 409). */
export class SyncHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SyncHttpError";
  }
}

/** Network errors, 5xx and 429 are worth retrying; anything else is not. */
export function isTransient(e: unknown): boolean {
  if (e instanceof SyncHttpError) return e.status >= 500 || e.status === 429;
  return e instanceof TypeError; // fetch: network failure
}

/** Errors that no batch can get past (authentication, unsupported version):
 *  the whole sync stops and the user is told. */
export function isFatal(e: unknown): boolean {
  return e instanceof SyncHttpError && [401, 403, 426].includes(e.status);
}

/** Sends one batch with `send`. If the server refuses it for its content (a
 *  non-transient, non-fatal 4xx such as 413 too large or 400 invalid), the
 *  batch is split to isolate the deltas at fault, which are returned as
 *  skipped instead of blocking the others (FIX-03). Fatal and transient
 *  errors are thrown. `onSent` runs for every part the server took. */
export async function sendIsolating<T, R>(
  batch: T[],
  send: (part: T[]) => Promise<R>,
  onSent: (part: T[], body: R) => Promise<void> | void,
): Promise<T[]> {
  try {
    await onSent(batch, await send(batch));
    return [];
  } catch (e) {
    if (!(e instanceof SyncHttpError) || isTransient(e) || isFatal(e)) throw e;
    if (batch.length === 1) return batch;
    const half = Math.ceil(batch.length / 2);
    return [
      ...(await sendIsolating(batch.slice(0, half), send, onSent)),
      ...(await sendIsolating(batch.slice(half), send, onSent)),
    ];
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs `fn`, retrying transient failures with growing waits. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  delays: number[] = [500, 1000, 2000],
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= delays.length || !isTransient(e)) throw e;
      await sleep(delays[attempt]);
    }
  }
}

/** Splits deltas into request-sized batches, keeping their order (the server
 *  applies them in order). A delta bigger than the byte target goes alone. */
export function batchDeltas<T>(
  deltas: T[],
  maxCount = MAX_BATCH_DELTAS,
  maxBytes = MAX_BATCH_BYTES,
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const d of deltas) {
    const size = JSON.stringify(d).length;
    if (current.length > 0 && (current.length >= maxCount || bytes + size > maxBytes)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(d);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** A document as the server returns it on a pull or as a conflict. */
export interface RemoteDoc {
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  revision: number;
  author?: string;
  deleted: boolean;
  hlc: string;
}

/** One pull page from the server. */
export interface PullPage {
  docs: RemoteDoc[];
  cursor: number;
  hasMore: boolean;
}

/** Safety stop for a pull loop (500 docs per page → 500k documents). */
const MAX_PULL_PAGES = 1000;

/** Pulls every page after `cursor`, handing each to `apply` before asking for
 *  the next, so progress survives an interruption (FIX-02). Returns the
 *  number of documents received. */
export async function pullPages(
  token: string,
  cursor: string,
  apply: (page: PullPage) => Promise<void> | void,
): Promise<number> {
  let since = cursor;
  let pulled = 0;
  for (let i = 0; i < MAX_PULL_PAGES; i++) {
    const page = await withRetry(() =>
      syncRequest<PullPage>(`/sync/pull?since=${since}`, token),
    );
    await apply(page);
    pulled += page.docs.length;
    since = String(page.cursor);
    if (!page.hasMore) break;
  }
  return pulled;
}

/** One authenticated request to the server; throws `SyncHttpError` on a
 *  non-2xx. An empty answer (204) resolves to `undefined`. */
export async function syncRequest<T>(
  path: string,
  token: string,
  init: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      [VERSION_HEADER]: APP_VERSION,
      [FEATURES_HEADER]: SYNC_FEATURES,
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
      code?: string;
      message?: string;
    };
    throw new SyncHttpError(
      res.status,
      body.code ?? "",
      body.message ?? `${path} ${res.status}`,
      body,
    );
  }
  const text = res.status === 204 ? "" : await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
