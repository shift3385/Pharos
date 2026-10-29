function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// When the recovery key was last shown, so the profile can say so. Only the
// date is kept here, never the key (ADR-0024).
const SHOWN_AT_KEY = "pharos.recoveryKeyShownAt";

export const recoveryKeyApi = {
  /** The recovery key only exists for the encrypted desktop database. */
  available(): boolean {
    return isTauri();
  },
  /** The recovery key of the local database (SEC-03). Call it only on an
   *  explicit request of the user, and never log or store the result. */
  async reveal(): Promise<string> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("recovery_key_export");
  },
  lastShownAt(): string | null {
    try {
      return localStorage.getItem(SHOWN_AT_KEY);
    } catch {
      return null;
    }
  },
  markShown(): string {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(SHOWN_AT_KEY, now);
    } catch {
      // The date is a convenience; failing to keep it changes nothing.
    }
    return now;
  },
};
