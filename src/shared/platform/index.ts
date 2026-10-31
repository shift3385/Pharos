// The one platform layer (BASE-10, ADR-0004). Pharos runs either as the
// desktop app (Tauri: the Rust core and its encrypted local store) or as a web
// build that is a pure client of the server. Code asks here which one it is
// and what it can do, instead of each module checking the Tauri globals.

import { ReportedError } from "../ui/notify";

/** True inside the Tauri desktop app. Checked per call, not at module load, so
 *  it holds whenever the Tauri globals are injected. */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/** Calls a command of the desktop core (Tauri `invoke`, loaded on demand so
 *  the web build never needs it). `args` may be raw bytes, with headers in
 *  `options` (chunked uploads). */
export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown> | Uint8Array,
  options?: { headers: Record<string, string> },
): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return options ? tauriInvoke<T>(cmd, args, options) : tauriInvoke<T>(cmd, args);
}

/** What only the desktop has until the server stores it too (SYNC-04b):
 *  attachments, the user's own templates and revision history live in the
 *  local store. The web shows the built-in templates and no history. */
export const capabilities = {
  /** Offline work, the local store, the oplog and the conflict panel. */
  localStore: () => isTauri(),
  attachments: () => isTauri(),
  userTemplates: () => isTauri(),
  revisionHistory: () => isTauri(),
};

/** Raised on the web for something only the desktop app can do, after the
 *  user was told (a `ReportedError`). */
export class DesktopOnlyError extends ReportedError {
  constructor(readonly feature: keyof typeof capabilities) {
    super(`desktop-only: ${feature}`);
    this.name = "DesktopOnlyError";
  }
}
