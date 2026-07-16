import type { Profile, ProfileInput } from "../model/types";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// Browser fallback so the profile UI is usable in `vite dev` (no Tauri backend).
// The real, encrypted SQLite store lives in Rust and is used in the desktop app.
const FALLBACK_KEY = "pharos.profile";

const browserApi = {
  async get(): Promise<Profile | null> {
    try {
      const raw = localStorage.getItem(FALLBACK_KEY);
      return raw ? (JSON.parse(raw) as Profile) : null;
    } catch {
      return null;
    }
  },
  async upsert(input: ProfileInput): Promise<Profile> {
    const existing = await browserApi.get();
    const now = new Date().toISOString();
    const profile: Profile = existing
      ? {
          ...existing,
          displayName: input.displayName,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role ?? existing.role,
          updatedAt: now,
          updatedBy: existing.id,
          revision: existing.revision + 1,
        }
      : {
          id: crypto.randomUUID(),
          workspaceId: "local",
          displayName: input.displayName,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role ?? "test_manager",
          createdBy: "local",
          updatedBy: "local",
          createdAt: now,
          updatedAt: now,
          revision: 1,
        };
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(profile));
    return profile;
  },
};

export const profileApi = {
  async get(): Promise<Profile | null> {
    if (!isTauri()) return browserApi.get();
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<Profile | null>("profile_get");
  },
  async upsert(input: ProfileInput): Promise<Profile | null> {
    if (!isTauri()) return browserApi.upsert(input);
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<Profile | null>("profile_upsert", { input });
  },
};
