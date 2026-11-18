import { ApiError, request } from "./authApi";
import type { Session } from "../model/types";
import { defaultSessionStore } from "../state/session-store";
import { renewSession } from "../state/sessionRenewal";

// Changing and recovering the account password (SEC-08, SEC-09 by email;
// ADR-0045). Passwords, codes and tokens only travel in request bodies: never
// in a URL, never stored, never logged.

export interface RecoveryStatus {
  total: number;
  remaining: number;
  generatedAt: string | null;
  lastUsedAt: string | null;
}

/** An account as a server administrator sees it (SEC-11). */
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  createdAt: string;
  recoveryCodes: { total: number; remaining: number };
  workspaces: number;
  /** SEC-12: when, by whom and why it was disabled; null when active. */
  disabled: { at: string; byName: string | null; reason: string | null } | null;
}

/** Which accounts «Usuarios» lists (SEC-12). */
export type AdminUserStatus = "active" | "disabled" | "all";

/** A shared workspace the account is the only active Test Manager of: a
 *  successor is chosen among `candidates` before disabling it (SEC-12). */
export interface ManagedAlone {
  workspaceId: string;
  name: string;
  members: number;
  candidates: { userId: string; displayName: string; role: string }[];
}

export interface DisableImpact {
  managedAlone: ManagedAlone[];
  /** The account is the last active administrator: it cannot be disabled. */
  lastAdmin: boolean;
}

/** A reset link made by an administrator (SEC-09): emailed (no token here)
 *  or handed over (the token, and the link when the server has a web
 *  address). Shown once. */
export interface AdminReset {
  delivery: "email" | "link";
  expiresAt: string;
  token?: string;
  link?: string;
}

export interface RecoverInput {
  email: string;
  code: string;
  newPassword: string;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

/** A call as the signed-in user. A token that expired while the page was open
 *  is renewed and the call repeated once (a 401 comes before the server looks
 *  at the request), never under another account. */
async function authed<T>(
  path: string,
  init: (session: Session) => RequestInit = () => ({}),
): Promise<T> {
  const session = await defaultSessionStore.load();
  if (!session)
    throw new ApiError(401, "unauthorized", "Authentication is required.");
  const call = (s: Session) => {
    const options = init(s);
    return request<T>(path, {
      ...options,
      headers: { ...options.headers, authorization: `Bearer ${s.accessToken}` },
    });
  };
  try {
    return await call(session);
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 401) throw error;
    const renewed = await renewSession(session.accessToken);
    if (!renewed || renewed.user.id !== session.user.id) throw error;
    return call(renewed);
  }
}

/** The app's link (`…/#/restablecer?token=…`) or a bare token, as pasted from
 *  the email; null when it holds neither. */
export function tokenFromLink(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  const match = /[?&]token=([^&\s]+)/.exec(value);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
  return /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : null;
}

export const accountApi = {
  /** What this server offers: email reset only with SMTP configured. */
  capabilities: () => request<{ emailReset: boolean }>("/auth/capabilities"),

  /** Changes the password; this session stays open, the others close. */
  changePassword: (currentPassword: string, newPassword: string) =>
    authed<{ sessionsClosed: number }>("/auth/password", (s) =>
      post({ currentPassword, newPassword, refreshToken: s.refreshToken }),
    ),

  recoveryStatus: () => authed<RecoveryStatus>("/auth/recovery-codes"),

  /** New recovery codes; the old ones stop working. */
  regenerateCodes: (currentPassword: string) =>
    authed<{ recoveryCodes: string[] }>("/auth/recovery-codes", () =>
      post({ currentPassword }),
    ),

  /** A new password with a recovery code; returns a new session. */
  recover: (input: RecoverInput) =>
    request<Session & { recoveryCodesRemaining: number }>(
      "/auth/recover",
      post(input),
    ),

  requestReset: (email: string, locale: "es" | "en") =>
    request<{ status: string }>("/auth/reset/request", post({ email, locale })),

  /** The account a reset link is for, while it still works, and the
   *  administrator who made it, if one did. */
  checkReset: (token: string) =>
    request<{ email: string; issuedBy?: string | null }>(
      "/auth/reset/check",
      post({ token }),
    ),

  // ---- Server administrator (SEC-11, SEC-09; ADR-0045) ----

  adminUsers: (search = "", offset = 0, limit = 50, status: AdminUserStatus = "all") => {
    const q = new URLSearchParams({ offset: String(offset), limit: String(limit), status });
    if (search.trim()) q.set("q", search.trim());
    return authed<{ users: AdminUser[]; total: number; admins: number; disabled?: number }>(
      `/admin/users?${q.toString()}`,
    );
  },

  adminReset: (userId: string, delivery: "email" | "link", locale: "es" | "en") =>
    authed<AdminReset>(
      `/admin/users/${encodeURIComponent(userId)}/password-reset`,
      () => post({ delivery, locale }),
    ),

  setAdmin: (userId: string, isAdmin: boolean) =>
    authed<{ isAdmin: boolean; changed: boolean }>(
      `/admin/users/${encodeURIComponent(userId)}/admin`,
      () => ({ method: "PUT", body: JSON.stringify({ isAdmin }) }),
    ),

  // ---- Disabling an account (SEC-12; ADR-0045 amendment B) ----

  disableImpact: (userId: string) =>
    authed<DisableImpact>(`/admin/users/${encodeURIComponent(userId)}/disable-impact`),

  setDisabled: (
    userId: string,
    input: {
      disabled: boolean;
      reason?: string | null;
      successors?: { workspaceId: string; userId: string }[];
    },
  ) =>
    authed<{ disabled: boolean; changed: boolean }>(
      `/admin/users/${encodeURIComponent(userId)}/disabled`,
      () => ({ method: "PUT", body: JSON.stringify(input) }),
    ),

  confirmReset: (token: string, newPassword: string) =>
    request<null>("/auth/reset/confirm", post({ token, newPassword })),
};
