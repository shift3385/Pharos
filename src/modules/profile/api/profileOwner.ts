// The desktop keeps ONE profile (alias and official name) in its local store,
// whoever is signed in. Which account it belongs to is written here, so that a
// second account signing in on the same installation never takes, or sends to
// the server, the names of the account that left (FIX-46).

const KEY = "pharos.profile.account";

/** The account the local profile belongs to, or null when unknown. */
export function profileOwner(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Records that the local profile now holds the names of `userId`. */
export function setProfileOwner(userId: string): void {
  try {
    localStorage.setItem(KEY, userId);
  } catch {
    // Without storage the account's names always win (see syncProfileNames).
  }
}
