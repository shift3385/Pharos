import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { authApi, ApiError, NetworkError } from "../api/authApi";
import type { LoginInput, RegisterInput, Session } from "../model/types";
import {
  defaultSessionStore,
  type SessionStore,
} from "./session-store";
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
            const refreshed = await authApi.refresh(stored.refreshToken);
            if (!cancelled) await applySession(refreshed);
          } catch {
            if (!cancelled) await clearSession();
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, applySession, clearSession, initialSession]);

  const login = useCallback(
    async (input: LoginInput) => {
      await applySession(await authApi.login(input));
    },
    [applySession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      await applySession(await authApi.register(input));
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
  }, [clearSession]);

  const value = useMemo(
    () => ({ status, user, offline, login, register, logout }),
    [status, user, offline, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
