import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@shared/platform";

/** Prefix of the Rust error for a database written by a newer Pharos (SEC-06). */
export const NEWER_DB_ERROR = "db-newer-than-app";
/** Another Pharos process (the app or the CLI) has the data folder open
 *  (ADR-0050, until SEC-05b). */
export const DB_IN_USE_ERROR = "db-in-use";
/** Not enough free space to convert `pharos.db.enc` safely (SEC-05). */
export const CONVERT_NO_SPACE_ERROR = "db-convert-no-space";
/** Converting `pharos.db.enc` failed; the original is intact (SEC-05). */
export const CONVERT_FAILED_ERROR = "db-convert-failed";
/** `pharos.db.enc` says the data moved to `pharos.db`, which is missing. */
export const DB_MISSING_ERROR = "db-missing";

/** Open errors that may go away without the recovery key: space freed, the
 *  other Pharos closed, a conversion tried again. */
export function isRetryable(error: string): boolean {
  return [DB_IN_USE_ERROR, CONVERT_NO_SPACE_ERROR, CONVERT_FAILED_ERROR].some(
    (prefix) => error.startsWith(prefix),
  );
}
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

/** How often the UI asks whether the open is converting `pharos.db.enc`. */
const CONVERTING_POLL_MS = 400;

/** Waits for `command` (`db_open_error` or `db_open_retry`, which return
 *  once the open has finished) while asking `db_open_converting`. */
async function awaitOpen(
  command: string,
  onConverting: (converting: boolean) => void,
): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  let done = false;
  const poll = async () => {
    while (!done) {
      const converting = await invoke<boolean>("db_open_converting").catch(() => false);
      if (!done) onConverting(converting);
      await new Promise((resolve) => setTimeout(resolve, CONVERTING_POLL_MS));
    }
  };
  void poll();
  try {
    return (await invoke<string | null>(command)) ?? null;
  } finally {
    done = true;
    onConverting(false);
  }
}

export interface DbOpenState {
  /** Why the local database did not open: `undefined` while opening, `null`
   *  when it opened (always `null` outside the desktop app). */
  error: string | null | undefined;
  /** True while the open converts a `pharos.db.enc` of 0.5 (SEC-05). */
  converting: boolean;
  /** Marks it opened after a recovery. */
  markOpened: () => void;
  /** Opens again after an error `isRetryable` accepts. */
  retry: () => void;
}

export function useDbOpenError(): DbOpenState {
  const [error, setError] = useState<string | null | undefined>(
    isTauri() ? undefined : null,
  );
  const [converting, setConverting] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    awaitOpen("db_open_error", setConverting)
      .then(setError)
      .catch(() => setError(null));
  }, []);
  const markOpened = useCallback(() => setError(null), []);
  const retry = useCallback(() => {
    setError(undefined);
    awaitOpen("db_open_retry", setConverting)
      .then(setError)
      .catch((e: unknown) => setError(String(e)));
  }, []);
  return { error, converting, markOpened, retry };
}

/** Opens the database with a typed recovery key and stores the key in the
 *  keychain again (SEC-03). Rejects with the Rust error, which never repeats
 *  the key. */
export async function recoverDb(recoveryKey: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("db_recover", { recoveryKey });
}
