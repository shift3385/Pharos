// Public API of the auth module (spec §4).
export { AuthProvider } from "./state/AuthProvider";
export { useAuth } from "./state/useAuth";
export { AuthScreen } from "./ui/AuthScreen";
export type { AuthUser } from "./model/types";

import { defaultSessionStore } from "./state/session-store";

/** Current access token from the cached session (null if signed out). Used by
 *  other modules that call the backend on the user's behalf (e.g. sync). */
export async function getAccessToken(): Promise<string | null> {
  return (await defaultSessionStore.load())?.accessToken ?? null;
}
