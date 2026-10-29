// CORS origin helpers. Kept apart from env.ts, which loads and validates the
// process environment as soon as it is imported (the app and tests import
// these helpers without that side effect).

/** Origins the desktop and web clients can send: http(s) or the Tauri scheme,
 *  scheme + host (+ port) only, without path or trailing slash. */
export function isExplicitOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      ["http:", "https:", "tauri:"].includes(url.protocol) &&
      !url.username &&
      `${url.protocol}//${url.host}` === origin
    );
  } catch {
    return false;
  }
}

/** Splits the comma-separated CORS_ORIGIN value. */
export function parseOrigins(value: string): string[] {
  return value
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}
