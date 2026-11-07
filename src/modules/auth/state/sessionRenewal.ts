// Renews the session when the access token expires while the app is open. The
// server rotates refresh tokens: each one works once, so a screen's parallel
// requests (or two tabs) must share one renewal or the losers would be told
// the session is over. This is the only place that spends a refresh token.
import { ApiError, authApi } from "../api/authApi";
import type { Session } from "../model/types";
import { defaultSessionStore, type SessionStore } from "./session-store";

/** Told the outcome of a renewal: the session to use, or null if it is over. */
type RenewalListener = (next: Session | null) => void;

const listeners = new Set<RenewalListener>();
let inFlight: Promise<Session | null> | null = null;

/** Subscribes to renewals; returns the unsubscribe function. */
export function onSessionRenewal(listener: RenewalListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** One renewal at a time across tabs, where the browser can tell (Web Locks
 *  needs a secure context). `renew` also copes with not having it. */
async function acrossTabs(fn: () => Promise<Session | null>): Promise<Session | null> {
  return "locks" in navigator
    ? navigator.locks.request("pharos.session.renewal", fn)
    : fn();
}

async function renew(staleToken: string, store: SessionStore): Promise<Session | null> {
  const stored = await store.load();
  if (!stored || stored.accessToken !== staleToken) return stored; // Done already.
  let next: Session;
  try {
    next = await authApi.refresh(stored.refreshToken);
  } catch (e) {
    // Only the server saying no ends the session; being unable to ask does not.
    if (!(e instanceof ApiError) || ![400, 401].includes(e.statusCode)) throw e;
    const now = await store.load();
    // Another tab spent this refresh token first: its session is the good one.
    if (now && now.refreshToken !== stored.refreshToken) return now;
    await store.clear();
    return null;
  }
  // Signed out (or into another account) while asking: that decision stands.
  const now = await store.load();
  if (now?.refreshToken !== stored.refreshToken) return now;
  await store.save(next);
  return next;
}

/**
 * The session to use instead of the one whose `staleToken` the server refused.
 * Null means it is over and the user must sign in again. Throws (`NetworkError`,
 * or `ApiError` on a server failure) when it cannot be told right now: the
 * session is kept, and trying again later may work.
 */
export function renewSession(
  staleToken: string,
  store: SessionStore = defaultSessionStore,
): Promise<Session | null> {
  inFlight ??= acrossTabs(() => renew(staleToken, store))
    .then((next) => {
      listeners.forEach((listener) => listener(next));
      return next;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
