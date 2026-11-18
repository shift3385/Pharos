// Where the app reaches its server (SEC-10, ADR-0046). Every request to the
// server goes through `serverFetch`, the only place that knows where it is.
//
// - **Web:** the build's `VITE_API_URL` (or the local server), with the
//   browser's `fetch`. The web is served by its own server; it has no picker.
// - **Desktop:** the server picked at sign-in, kept by the Rust core. The
//   request goes through `server_request` (src-tauri/src/server.rs): the
//   webview's CSP allows no connection to any server, so even injected script
//   cannot send data anywhere, and Rust only talks to the chosen server, with
//   https except to this computer.

import { invoke, isTauri } from "./index";

/** The server used when the build names none. */
export const DEFAULT_SERVER_URL = "http://localhost:3000";

/** The build's server origin, without a trailing slash. On the desktop it is
 *  only the default until the user picks one (`getServer`). */
export function serverUrl(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  return (configured ?? DEFAULT_SERVER_URL).replace(/\/+$/, "");
}

/** Why the desktop could not reach or use a server (src-tauri/src/server.rs). */
export type ServerErrorKind =
  | "invalid"
  | "insecure"
  | "unreachable"
  | "timeout"
  | "tls"
  | "not_pharos"
  | "session_open"
  | "account_other_server"
  | "bad_path"
  | "storage";

export interface ServerErrorBody {
  kind: ServerErrorKind;
  message: string;
  /** For `account_other_server`: the server that account belongs to. */
  origin?: string;
}

export function isServerErrorBody(e: unknown): e is ServerErrorBody {
  return typeof e === "object" && e !== null && typeof (e as ServerErrorBody).kind === "string";
}

/** No answer from the server (E3) or an untrusted certificate (E4). A
 *  `TypeError`, like `fetch`'s network failure, so every caller that retries
 *  or reports «no connection» on one keeps doing so. */
export class ServerConnectionError extends TypeError {
  constructor(readonly kind: "unreachable" | "timeout" | "tls") {
    super(`server connection failed: ${kind}`);
    this.name = "ServerConnectionError";
  }
}

const CONNECTION_KINDS = new Set(["unreachable", "timeout", "tls"]);
/** Statuses whose Response may not carry a body. */
const NULL_BODY = new Set([101, 204, 205, 304]);

interface RustResponse {
  status: number;
  contentType: string | null;
  body: string;
}

/** Sends a request to the server. `path` is the route on that server and must
 *  start with a single `/` (never a full URL), so no caller can send a request
 *  anywhere but the chosen server. A network failure rejects with a
 *  `TypeError`, as `fetch` does. */
export async function serverFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`server path must start with "/": ${path}`);
  }
  if (!isTauri()) return fetch(`${serverUrl()}${path}`, init);

  if (init.body != null && typeof init.body !== "string") {
    throw new Error("serverFetch sends text bodies only on the desktop");
  }
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, name) => {
    headers[name] = value;
  });
  let res: RustResponse;
  try {
    res = await invoke<RustResponse>("server_request", {
      request: { method: init.method ?? "GET", path, headers, body: init.body ?? null },
    });
  } catch (e) {
    if (isServerErrorBody(e) && CONNECTION_KINDS.has(e.kind)) {
      throw new ServerConnectionError(e.kind as ServerConnectionError["kind"]);
    }
    throw e;
  }
  return new Response(NULL_BODY.has(res.status) ? null : res.body, {
    status: res.status,
    headers: res.contentType ? { "content-type": res.contentType } : {},
  });
}

/** A server used on this computer, with its last account. */
export interface RecentServer {
  origin: string;
  local: boolean;
  email: string;
  /** Seconds since the epoch, as text. */
  lastUsed: string;
}

export interface ServerInfo {
  origin: string;
  /** This computer (http allowed, no padlock). */
  local: boolean;
  recent: RecentServer[];
}

/** What `/health` answered. Older servers send `status` only. */
export interface ServerHealth {
  status?: string;
  service?: string;
  version?: string;
  accepted?: string[];
}

export interface ServerCheck {
  origin: string;
  local: boolean;
  health: ServerHealth;
}

export interface PendingChanges {
  email: string;
  count: number;
}

function originIsLocal(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "[::1]" || /^127\./.test(host);
  } catch {
    return false;
  }
}

/** The server this app signs in to. On the web, the build's. */
export async function getServer(): Promise<ServerInfo> {
  if (!isTauri()) {
    const origin = serverUrl();
    return { origin, local: originIsLocal(origin), recent: [] };
  }
  return invoke<ServerInfo>("server_get");
}

/** Checks an address without saving it (desktop). Rejects with a
 *  `ServerErrorBody`. */
export function checkServer(url: string): Promise<ServerCheck> {
  return invoke<ServerCheck>("server_check", { url });
}

/** Picks the server (desktop, signed out only). Resolves to its origin. */
export function setServer(url: string): Promise<string> {
  return invoke<string>("server_set", { url });
}

/** Ties the account to the current server; rejects with
 *  `account_other_server` when its local data belongs to another one. No-op
 *  on the web. */
export async function bindAccount(userId: string, email: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("server_bind_account", { userId, email });
}

/** Local changes not yet sent to the current server, per account (desktop). */
export async function pendingChanges(): Promise<PendingChanges[]> {
  if (!isTauri()) return [];
  return invoke<PendingChanges[]>("server_pending");
}

/** `pharos.example.com`, `localhost:3000`: the origin without its scheme. */
export function serverHost(origin: string): string {
  return origin.replace(/^[a-z]+:\/\//i, "");
}
