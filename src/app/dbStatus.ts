import { useEffect, useState } from "react";

/** Prefix of the Rust error for a database written by a newer Pharos (SEC-06). */
export const NEWER_DB_ERROR = "db-newer-than-app";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/** Why the local database did not open at startup: `undefined` while asking,
 *  `null` when it opened (always `null` outside the desktop app). */
export function useDbOpenError(): string | null | undefined {
  const [error, setError] = useState<string | null | undefined>(
    isTauri() ? undefined : null,
  );
  useEffect(() => {
    if (!isTauri()) return;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<string | null>("db_open_error"))
      .then((e) => setError(e ?? null))
      .catch(() => setError(null));
  }, []);
  return error;
}
