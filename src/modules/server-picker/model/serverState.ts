// What the sign-in screen tells about a server (SEC-10, ADR-0046): whether
// this app can work with it, and which message each failure shows (E1–E8 of
// the sketches).

import type { ServerErrorKind, ServerHealth } from "@shared/platform/serverUrl";

/** How this app gets on with a server, from its `/health`:
 *  - `ok`: same minor;
 *  - `read_only`: the server is one minor ahead; this app may only read
 *    (VERSIONING §6.5);
 *  - `app_too_old` / `server_too_old`: the server refuses this app (426);
 *  - `unknown`: a server older than SEC-10 does not say; sign-in decides. */
export type Compatibility = "ok" | "read_only" | "app_too_old" | "server_too_old" | "unknown";

function minorOf(version: string | undefined): { major: number; minor: number } | null {
  const m = /^(\d+)\.(\d+)\./.exec(version ?? "");
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

export function compatibility(health: ServerHealth, appVersion: string): Compatibility {
  const app = minorOf(appVersion);
  const server = minorOf(health.version);
  if (!app || !server || !Array.isArray(health.accepted)) return "unknown";
  const appMinor = `${app.major}.${app.minor}`;
  if (health.accepted.includes(appMinor)) {
    return health.accepted[0] === appMinor ? "ok" : "read_only";
  }
  const newer = app.major > server.major || (app.major === server.major && app.minor > server.minor);
  return newer ? "server_too_old" : "app_too_old";
}

/** The message of a failure: an i18n key under `server.error` and whether it
 *  is about the address field (so the field is marked invalid). */
export interface ServerProblem {
  key: string;
  field: boolean;
}

export function problemOf(kind: ServerErrorKind | "app_too_old" | "server_too_old"): ServerProblem {
  switch (kind) {
    case "invalid":
    case "bad_path":
      return { key: "invalid", field: true };
    case "insecure":
      return { key: "insecure", field: true };
    case "unreachable":
    case "timeout":
      return { key: "unreachable", field: true };
    case "tls":
      return { key: "tls", field: true };
    case "not_pharos":
      return { key: "notPharos", field: true };
    case "app_too_old":
      return { key: "appTooOld", field: false };
    case "server_too_old":
      return { key: "serverTooOld", field: false };
    default:
      return { key: "generic", field: false };
  }
}

/** «hace 2 días», «today»… for a time given in seconds since the epoch. */
export function lastUsedLabel(seconds: string, language: string, now = Date.now()): string {
  const then = Number(seconds) * 1000;
  if (!Number.isFinite(then) || then <= 0) return "";
  const days = Math.round((then - now) / 86_400_000);
  return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(days, "day");
}
