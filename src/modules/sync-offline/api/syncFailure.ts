// Sync failures in the local log (BASE-08, ADR-0022). The UI still tells the
// user; this also leaves a line for "Exportar diagnóstico". Nothing the server
// wrote goes to the log: an HTTP failure keeps its status and code only.
import { logClientError } from "@shared/diagnostics";
import { SyncHttpError } from "./transport";

/** What was being done when the sync failed (the log's context line). */
export type SyncAction =
  | "manual"
  | "auto"
  | "state"
  | "conflicts-list"
  | "key-conflicts-list"
  | "conflict-resolve"
  | "purge"
  | "push-refused";

/**
 * The value to log for a sync failure. A `SyncHttpError` becomes a new error
 * with only its status and code: its message is the server's text (a parse
 * error can quote the request body) and its stack starts with that message.
 * Anything else is logged as is: `logClientError` keeps an Error's redacted
 * name, message and stack, and only the type of any other value (a native
 * command rejects with a string, which may quote stored data).
 */
export function loggableSyncError(e: unknown): unknown {
  if (!(e instanceof SyncHttpError)) return e;
  const safe = new Error(`HTTP ${e.status}${e.code ? ` ${e.code}` : ""}`);
  safe.name = "SyncHttpError";
  safe.stack = undefined;
  return safe;
}

/** Records a failed sync step in the local log. */
export function logSyncFailure(e: unknown, action: SyncAction): void {
  logClientError(loggableSyncError(e), `sync: ${action}`);
}

/** Records the changes the server refused for their content (FIX-03): one
 *  line per push, with entity types and ids only, never payloads. */
export function logRefusedChanges(
  refused: readonly { entity: string; entityId: string }[],
): void {
  if (refused.length === 0) return;
  const ids = refused.map((d) => `${d.entity}:${d.entityId}`).join(", ");
  const e = new Error(`${refused.length} change(s) refused: ${ids}`);
  e.name = "SyncRefused";
  e.stack = undefined;
  logSyncFailure(e, "push-refused");
}

/** Short key of a failure, to tell a repeat from a new one. */
function failureKey(e: unknown): string {
  if (e instanceof SyncHttpError) return `http:${e.status}:${e.code}`;
  if (e instanceof Error) return `${e.name}:${e.message}`;
  return typeof e;
}

/**
 * Logs background failures once: a step that keeps failing the same way (the
 * 5 s state refresh, auto-sync while the API is down, the purge) writes one
 * line, not one per attempt, so it does not use up the log's
 * 20-messages-per-10-s budget. A success, or a different failure, re-arms it.
 */
export class SyncFailureLog {
  private last = new Map<SyncAction, string>();

  report(e: unknown, action: SyncAction): void {
    const key = failureKey(e);
    if (this.last.get(action) === key) return;
    this.last.set(action, key);
    logSyncFailure(e, action);
  }

  clear(action: SyncAction): void {
    this.last.delete(action);
  }
}
