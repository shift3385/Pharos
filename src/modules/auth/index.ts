// Public API of the auth module (spec §4).
export { AuthProvider } from "./state/AuthProvider";
export { useAuth } from "./state/useAuth";
export { AuthScreen } from "./ui/AuthScreen";
export type { AuthUser } from "./model/types";

import { defaultSessionStore } from "./state/session-store";
import { renewSession as renew } from "./state/sessionRenewal";

/** Current access token from the cached session (null if signed out). Used by
 *  other modules that call the backend on the user's behalf (e.g. sync). */
export async function getAccessToken(): Promise<string | null> {
  return (await defaultSessionStore.load())?.accessToken ?? null;
}

/** Token and user of the cached session, read together so a sync never mixes
 *  one account's token with another's local changes (FIX-07). */
export async function getSession(): Promise<{
  accessToken: string;
  userId: string;
} | null> {
  const s = await defaultSessionStore.load();
  return s ? { accessToken: s.accessToken, userId: s.user.id } : null;
}

/** The session to retry with after the server refused `staleToken` (401). Null
 *  if it is over: the app has already gone back to the sign-in screen. Throws
 *  when the server cannot be asked right now; the session is kept. */
export async function renewSession(staleToken: string): Promise<{
  accessToken: string;
  userId: string;
} | null> {
  const s = await renew(staleToken);
  return s ? { accessToken: s.accessToken, userId: s.user.id } : null;
}
