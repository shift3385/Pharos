// Preferences of an account that travel with it between its devices (UX-27,
// ADR-0038), today the Inicio board. The server keeps them
// (`/api/me/preferences/:key`); this device keeps a copy per account, so the
// last value shows at once and works offline, on the desktop too. The newest
// change wins, by the time it was made: a change made offline stays
// «pending» here and is sent on the next pull.

import { serverApi } from "@modules/sync-offline";

/** The keys the server accepts (`PREFERENCE_KEYS` in the server). */
export type PreferenceKey = "home.board";

export interface StoredPreference {
  value: unknown;
  /** When the value was chosen (ISO), on whichever device. */
  updatedAt: string;
  /** Chosen here and not confirmed by the server yet. */
  pending: boolean;
}

interface ServerPreference {
  key: string;
  value: unknown;
  updatedAt: string | null;
}

const storageKey = (userId: string, key: PreferenceKey) => `pharos.prefs.${userId}.${key}`;
const path = (key: PreferenceKey) => `/api/me/preferences/${encodeURIComponent(key)}`;

const isServerPreference = (v: unknown): v is ServerPreference =>
  !!v &&
  typeof v === "object" &&
  "value" in v &&
  "updatedAt" in v &&
  ((v as ServerPreference).updatedAt === null ||
    typeof (v as ServerPreference).updatedAt === "string");

/** This device's copy of an account's preference (null if none). */
export function readLocalPreference(userId: string, key: PreferenceKey): StoredPreference | null {
  if (!userId) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(userId, key)) ?? "null") as unknown;
    if (!raw || typeof raw !== "object") return null;
    const p = raw as Partial<StoredPreference>;
    if (typeof p.updatedAt !== "string" || !("value" in p)) return null;
    return { value: p.value, updatedAt: p.updatedAt, pending: p.pending === true };
  } catch {
    return null;
  }
}

function writeLocal(userId: string, key: PreferenceKey, pref: StoredPreference) {
  try {
    localStorage.setItem(storageKey(userId, key), JSON.stringify(pref));
  } catch {
    // Storage full or blocked: the server copy still travels.
  }
}

const later = (a: string, b: string | null) => b === null || Date.parse(a) > Date.parse(b);

/** Sends this device's pending value; the server answers with what it keeps
 *  (ours, or a newer one from another device), and that is adopted. Offline
 *  or refused, it stays pending for the next pull. */
async function push(userId: string, key: PreferenceKey): Promise<void> {
  const local = readLocalPreference(userId, key);
  if (!local?.pending) return;
  try {
    const kept = await serverApi.put<unknown>(path(key), key, {
      value: local.value,
      updatedAt: local.updatedAt,
    });
    if (!isServerPreference(kept) || kept.updatedAt === null) return;
    // Something newer may have been chosen here while the request was out.
    const now = readLocalPreference(userId, key);
    if (now && now.updatedAt !== local.updatedAt) return;
    writeLocal(userId, key, { value: kept.value, updatedAt: kept.updatedAt, pending: false });
  } catch {
    // Kept pending.
  }
}

/** Chooses a value: kept here at once (pending) and sent to the account. */
export async function savePreference(
  userId: string,
  key: PreferenceKey,
  value: unknown,
  at: Date = new Date(),
): Promise<void> {
  if (!userId) return;
  writeLocal(userId, key, { value, updatedAt: at.toISOString(), pending: true });
  await push(userId, key);
}

/** Brings this device up to date with the account: the newer of the two
 *  wins (a pending local change is sent; a newer server value replaces the
 *  copy). Returns the value to use; offline, this device's copy. */
export async function pullPreference(
  userId: string,
  key: PreferenceKey,
): Promise<StoredPreference | null> {
  if (!userId) return null;
  let remote: unknown;
  try {
    remote = await serverApi.get<unknown>(path(key));
  } catch {
    return readLocalPreference(userId, key);
  }
  const local = readLocalPreference(userId, key);
  if (!isServerPreference(remote)) return local;
  if (local?.pending && later(local.updatedAt, remote.updatedAt)) {
    await push(userId, key);
  } else if (remote.updatedAt !== null) {
    writeLocal(userId, key, { value: remote.value, updatedAt: remote.updatedAt, pending: false });
  }
  return readLocalPreference(userId, key);
}
