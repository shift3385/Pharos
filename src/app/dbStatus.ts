import { useCallback, useEffect, useState } from "react";

/** Prefix of the Rust error for a database written by a newer Pharos (SEC-06). */
export const NEWER_DB_ERROR = "db-newer-than-app";
/** The keychain has no key but an encrypted database exists (SEC-03). */
export const KEY_MISSING_ERROR = "db-key-missing";
/** The keychain key does not decrypt the database (SEC-03). */
export const KEY_MISMATCH_ERROR = "db-key-mismatch";
/** `db_recover`: the text is not a well-formed recovery key (a typo). */
export const INVALID_RECOVERY_KEY = "recovery-key-invalid";
/** `db_recover`: a well-formed recovery key that does not open the database. */
export const WRONG_RECOVERY_KEY = "recovery-key-wrong";

/** True for the open errors the recovery key can fix. */
export function isKeyError(error: string): boolean {
  return (
    error.startsWith(KEY_MISSING_ERROR) || error.startsWith(KEY_MISMATCH_ERROR)
  );
}

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/** Why the local database did not open at startup: `undefined` while asking,
 *  `null` when it opened (always `null` outside the desktop app). The second
 *  item marks it opened after a recovery. */
export function useDbOpenError(): [string | null | undefined, () => void] {
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
  const markOpened = useCallback(() => setError(null), []);
  return [error, markOpened];
}

/** Opens the database with a typed recovery key and stores the key in the
 *  keychain again (SEC-03). Rejects with the Rust error, which never repeats
 *  the key. */
export async function recoverDb(recoveryKey: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("db_recover", { recoveryKey });
}
