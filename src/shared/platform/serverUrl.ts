// Where the app reaches its server (SEC-10, ADR-0046). The only place that
// knows the server's address: every request to it goes through
// `serverFetch`, so the address can become configurable (chosen at sign-in on
// the desktop) and the desktop can send requests through its Rust core
// without touching the callers (`authApi`, `transport`).
//
// For now the address is the build's `VITE_API_URL`, or the local server.

/** The server used when the build names none. */
export const DEFAULT_SERVER_URL = "http://localhost:3000";

/** The server's origin, without a trailing slash. */
export function serverUrl(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  return (configured ?? DEFAULT_SERVER_URL).replace(/\/+$/, "");
}

/** Sends a request to the server. `path` is the route on that server and must
 *  start with a single `/` (never a full URL), so no caller can send a request
 *  anywhere but the chosen server. A network failure rejects with a
 *  `TypeError`, as `fetch` does. */
export function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return Promise.reject(new Error(`server path must start with "/": ${path}`));
  }
  return fetch(`${serverUrl()}${path}`, init);
}
