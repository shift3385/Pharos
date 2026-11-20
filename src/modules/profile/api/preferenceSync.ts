// Profile, language and preferences that follow the account (SYNC-09).
// The values travel as account preferences (`user_preferences`, UX-27):
// `ui.language`, `ui.theme` and `ui.appearance`; the newest change wins, even
// one made offline. The names of the profile travel as the account's names
// (`/auth/me`): the desktop keeps its own copy and the newer one wins.
//
// What depends on the device stays on it: a background image of your own
// (it may be larger than a preference can hold), the retention, the
// automatic sync and the download folder.

import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import { parseStamp } from "@shared/time/stamp";
import type { Profile, ProfileInput } from "../model/types";
import { pullPreference, savePreference } from "./accountPreferences";
import { profileOwner, setProfileOwner } from "./profileOwner";

export type SyncedLanguage = "es" | "en";
export type SyncedTheme = "light" | "dark" | "system";

/** The appearance that travels. `background` is null for an image of the
 *  device's own, which never travels and is never replaced. */
export interface SyncedAppearance {
  cardShadow: boolean;
  backgroundOpacity: number;
  background: "default" | "none" | null;
}

export const isLanguage = (v: unknown): v is SyncedLanguage => v === "es" || v === "en";
export const isTheme = (v: unknown): v is SyncedTheme => v === "light" || v === "dark" || v === "system";
export const isAppearance = (v: unknown): v is SyncedAppearance => {
  if (!v || typeof v !== "object") return false;
  const a = v as SyncedAppearance;
  return (
    typeof a.cardShadow === "boolean" &&
    typeof a.backgroundOpacity === "number" &&
    a.backgroundOpacity >= 0 &&
    a.backgroundOpacity <= 100 &&
    (a.background === "default" || a.background === "none" || a.background === null)
  );
};

const VALID: Record<"ui.language" | "ui.theme" | "ui.appearance", (v: unknown) => boolean> = {
  "ui.language": isLanguage,
  "ui.theme": isTheme,
  "ui.appearance": isAppearance,
};

export type SyncedKey = keyof typeof VALID;
export const SYNCED_KEYS = Object.keys(VALID) as SyncedKey[];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Brings one value up to date with the account. Returns the account's value
 * when it differs from `current` (the caller applies it); when the account
 * has nothing yet, this device's value becomes the account's.
 */
export async function pullSynced<T>(userId: string, key: SyncedKey, current: T): Promise<T | null> {
  const stored = await pullPreference(userId, key);
  if (!stored) {
    await savePreference(userId, key, current);
    return null;
  }
  if (!VALID[key](stored.value) || same(stored.value, current)) return null;
  return stored.value as T;
}

/** A change made here: kept at once and sent to the account. */
export function pushSynced(userId: string, key: SyncedKey, value: unknown): Promise<void> {
  return savePreference(userId, key, value);
}

interface ServerUser {
  id?: string;
  displayName: string;
  firstName: string;
  lastName: string;
  updatedAt?: string;
}

/** SQLite's `YYYY-MM-DD HH:MM:SS` (UTC) or ISO, as milliseconds. */
const millis = (s: string | undefined) => {
  if (!s) return 0;
  const n = parseStamp(s).getTime();
  return Number.isNaN(n) ? 0 : n;
};

const names = (p: ProfileInput) => [p.displayName, p.firstName, p.lastName].join("\u0000");

/**
 * The desktop's profile names and the account's: when they differ, the
 * newer change wins (the desktop's is sent, or the account's is kept here).
 * The desktop keeps one profile per installation, so that rule only holds
 * while the profile belongs to the account signed in: once another account
 * signs in, the account's names replace the local ones and nothing is sent
 * (FIX-46). The web edits the account directly, so it has nothing to do.
 * Offline, nothing changes.
 */
export async function syncProfileNames(): Promise<"sent" | "received" | "same" | "skipped"> {
  if (!isTauri()) return "skipped";
  try {
    const [local, remote] = await Promise.all([
      invoke<Profile | null>("profile_get"),
      serverApi.get<ServerUser>("/auth/me"),
    ]);
    const owned = !!remote.id && profileOwner() === remote.id;
    const equal = !!local && names(local) === names(remote);
    if (owned && local && !equal && millis(local.updatedAt) > millis(remote.updatedAt)) {
      const { displayName, firstName, lastName } = local;
      await serverApi.patch("/auth/me", { displayName, firstName, lastName });
      return "sent";
    }
    if (!equal) {
      await invoke("profile_upsert", {
        input: { displayName: remote.displayName, firstName: remote.firstName, lastName: remote.lastName, role: local?.role },
      });
    }
    if (remote.id) setProfileOwner(remote.id);
    return equal ? "same" : "received";
  } catch {
    return "skipped";
  }
}
