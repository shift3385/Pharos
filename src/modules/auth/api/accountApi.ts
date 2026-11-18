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

  /** The account a reset link is for, while it still works. */
  checkReset: (token: string) =>
    request<{ email: string }>("/auth/reset/check", post({ token })),

  confirmReset: (token: string, newPassword: string) =>
    request<null>("/auth/reset/confirm", post({ token, newPassword })),
};
