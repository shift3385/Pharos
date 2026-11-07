# auth

Authentication and session domain (spec §4). Implemented in Phase 1.

- **Account login** (email + password) against the backend (`server/`, module
  `auth`): Argon2id hashing, short-lived JWT access token + opaque refresh
  token with rotation and revocation.
- **Offline session:** the last valid session is cached securely (Windows
  Credential Manager via a Tauri `keyring` command on desktop; `localStorage`
  in the browser preview), so the desktop app reopens without connectivity.
  The first sign-in on a machine needs the backend.
- **Renewal** (`state/sessionRenewal.ts`, public as `renewSession()`): the only
  place that spends a refresh token. The server rotates them, so concurrent
  callers share one request, and other tabs wait for it through Web Locks when
  the browser offers them. The server refusing the token ends the session:
  `AuthProvider` shows the sign-in screen and a toast. It does not fire
  `pharos:signed-out`, so the execution drafts survive. A network or server
  failure keeps the session.

Layout: `api/authApi.ts` (HTTP calls), `model/` (types), `state/`
(`AuthProvider`, session store, `useAuth`), `ui/AuthScreen.tsx` (sign in /
sign up). Other modules consume it only through its public `index.ts`
(e.g. `getAccessToken()` for sync).
