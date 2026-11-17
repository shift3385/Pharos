import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import i18n from "i18next";
import { notify } from "@shared/ui/notify";
import { authApi, ApiError, NetworkError } from "../api/authApi";
import { accountApi, type RecoverInput } from "../api/accountApi";
import type { LoginInput, RegisterInput, Session } from "../model/types";
import {
  defaultSessionStore,
  type SessionStore,
} from "./session-store";
import { onSessionRenewal, renewSession } from "./sessionRenewal";
import { AuthContext, type AuthStatus } from "./auth-context";

interface AuthProviderProps {
  children: ReactNode;
  store?: SessionStore;
  /** Preloaded session (tests / synchronous restore); skips the startup fetch. */
  initialSession?: Session | null;
}

/**
 * Holds authentication state. On startup it loads any cached session and, when
 * the backend is reachable, validates/refreshes it; when offline it keeps the
 * cached session so the app still opens (spec §4).
 */
export function AuthProvider({
  children,
  store = defaultSessionStore,
  initialSession = null,
}: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>(
    initialSession ? "authenticated" : "loading",
  );
  const [offline, setOffline] = useState(false);
  const session = useRef<Session | null>(initialSession);
  const [user, setUser] = useState<Session["user"] | null>(
    initialSession?.user ?? null,
  );

  const applySession = useCallback(
    async (next: Session, isOffline = false) => {
      session.current = next;
      setUser(next.user);
      setOffline(isOffline);
      setStatus("authenticated");
      await store.save(next);
    },
    [store],
  );

  const clearSession = useCallback(async () => {
    session.current = null;
    setUser(null);
    setOffline(false);
    setStatus("unauthenticated");
    await store.clear();
  }, [store]);

  // A renewal, here or from a request that found its token expired. A session
  // that ends this way is not a sign-out: `pharos:signed-out` would throw away
  // the unsaved execution drafts, which wait for the user to sign in again.
  useEffect(
    () =>
      onSessionRenewal((next) => {
        if (next) {
          session.current = next;
          setUser(next.user);
          setOffline(false);
          setStatus("authenticated");
          return;
        }
        if (session.current) notify(i18n.t("auth.sessionExpired"), "warning");
        void clearSession();
      }),
    [clearSession],
  );

  // Restore session on startup.
  useEffect(() => {
    if (initialSession) return; // caller supplied a session (preload / tests)
    let cancelled = false;
    (async () => {
      const stored = await store.load();
      if (cancelled) return;
      if (!stored) {
        setStatus("unauthenticated");
        return;
      }
      // Optimistically enter with the cached session, then validate.
      session.current = stored;
      setUser(stored.user);
      setStatus("authenticated");
      try {
        const fresh = await authApi.me(stored.accessToken);
        if (!cancelled) await applySession({ ...stored, user: fresh });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof NetworkError) {
          // Offline: keep the cached session.
          setOffline(true);
        } else if (error instanceof ApiError && error.statusCode === 401) {
          try {
            await renewSession(stored.accessToken, store);
          } catch (renewal) {
            // The session is kept: the server could not be asked, not said no.
            if (!cancelled && renewal instanceof NetworkError) setOffline(true);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, applySession, initialSession]);

  const login = useCallback(
    async (input: LoginInput) => {
      await applySession(await authApi.login(input));
    },
    [applySession],
  );

  // A new account waits here while its recovery codes are shown (SEC-08):
  // the app opens only after the user says they saved them.
  const pending = useRef<Session | null>(null);

  const register = useCallback(
    async (input: RegisterInput) => {
      const { recoveryCodes = [], ...next } = await authApi.register(input);
      if (recoveryCodes.length === 0) {
        await applySession(next);
        return [];
      }
      pending.current = next;
      return recoveryCodes;
    },
    [applySession],
  );

  const completeRegistration = useCallback(async () => {
    const next = pending.current;
    pending.current = null;
    if (next) await applySession(next);
  }, [applySession]);

  const recover = useCallback(
    async (input: RecoverInput) => {
      const { recoveryCodesRemaining, ...next } = await accountApi.recover(input);
      await applySession(next);
      return recoveryCodesRemaining;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    const current = session.current;
    if (current) {
      try {
        await authApi.logout(current.refreshToken);
      } catch {
        // Best-effort; clear locally regardless.
      }
    }
    await clearSession();
    // Lets other modules drop this account's cached data (FIX-07).
    window.dispatchEvent(new CustomEvent("pharos:signed-out"));
  }, [clearSession]);

  const updateUser = useCallback(
    async (patch: Partial<Pick<Session["user"], "displayName" | "firstName" | "lastName">>) => {
      const current = session.current;
      if (!current) return;
      const next = { ...current, user: { ...current.user, ...patch } };
      session.current = next;
      setUser(next.user);
      await store.save(next);
    },
    [store],
  );

  const value = useMemo(
    () => ({ status, user, offline, login, register, completeRegistration, recover, logout, updateUser }),
    [status, user, offline, login, register, completeRegistration, recover, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
