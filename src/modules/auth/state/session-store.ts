import type { Session } from "../model/types";

/**
 * Abstraction over where the session is cached so the app can reopen offline
 * (spec §4). In the Tauri desktop app the session lives in the OS keychain
 * (Windows Credential Manager); in a plain browser it falls back to
 * localStorage.
 */
export interface SessionStore {
  load(): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(): Promise<void>;
}

const STORAGE_KEY = "pharos.session";

export const localSessionStore: SessionStore = {
  async load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  },
  async save(session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  },
  async clear() {
    localStorage.removeItem(STORAGE_KEY);
  },
};

/** Keychain-backed store using Tauri commands (Windows Credential Manager). */
export const tauriSessionStore: SessionStore = {
  async load() {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<string | null>("session_load");
    return raw ? (JSON.parse(raw) as Session) : null;
  },
  async save(session) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("session_save", { data: JSON.stringify(session) });
  },
  async clear() {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("session_clear");
  },
};

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/**
 * Picks the keychain store inside Tauri and localStorage in a plain browser.
 * The choice is made per call (runtime), not at module load, so it is correct
 * regardless of when the Tauri globals are injected.
 */
export const defaultSessionStore: SessionStore = {
  load: () => (isTauri() ? tauriSessionStore : localSessionStore).load(),
  save: (session) =>
    (isTauri() ? tauriSessionStore : localSessionStore).save(session),
  clear: () => (isTauri() ? tauriSessionStore : localSessionStore).clear(),
};
