// A second account on the tour's own API (localhost:3100, never the user's),
// for «Administración › Usuarios» (SEC-11): the tour account is the first on
// that server, so it is its administrator, and it needs someone else to reset
// or to name administrator. The example person: Ana Pérez, of Liomar's team.

const API = process.env.PHAROS_TOURS_API ?? "";

export const TEAMMATE = {
  email: "ana.perez.tour@pharos.example",
  displayName: "Ana Pérez",
  firstName: "Ana",
  lastName: "Pérez",
};

/** Registers Ana once; on a run that already has her, the server says 409
 *  and the account is the same. Returns nothing: the tab lists her. */
export async function ensureTeammate(): Promise<void> {
  if (new URL(API).port === "3000")
    throw new Error(
      "the tour never registers accounts on the user's API (port 3000)",
    );
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // A throwaway password of an example account on the tour's own server.
    body: JSON.stringify({ ...TEAMMATE, password: "tour-only-password-1" }),
  });
  if (!res.ok && res.status !== 409)
    throw new Error(
      `register teammate: HTTP ${res.status} ${await res.text()}`,
    );
}
