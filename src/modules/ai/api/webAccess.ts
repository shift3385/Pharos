// The desktop's AI key, used from the web (IA-12, ADR-0034). The server keeps
// one encrypted copy per account (`/ai/web-access`) and calls the provider for
// the web (`/ai/chat`).
//
// - Only the desktop uploads, and only through Rust (`ai_web_access_upload`):
//   the key goes from the keychain to the server without reaching this code.
// - Desktop and web can both read the state and remove the copy.
// - Nothing here ever holds the key.

import i18n from "i18next";
import { getSession, renewSession } from "@modules/auth";
import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type { AiMessage, OnlineProviderId } from "../model/types";

/** Providers the server can call («Compatible» stays on the desktop). */
export type WebProviderId = Exclude<OnlineProviderId, "custom">;

export function isWebProvider(id: OnlineProviderId): id is WebProviderId {
  return id !== "custom";
}

/** What the account has on its server (never the key). */
export interface WebAccess {
  /** The server keeps AI keys for the web (`AI_VAULT_KEY` is set). */
  available: boolean;
  /** A copy of the key is stored for this account. */
  enabled: boolean;
  provider: WebProviderId | null;
  model: string | null;
  updatedAt: string | null;
  /** Stored under an older server master key: upload it again. */
  needsReupload: boolean;
}

/** The web can call the provider with it right now. */
export function webAccessUsable(
  w: WebAccess | null | undefined,
): w is WebAccess & { provider: WebProviderId; model: string } {
  return (
    !!w &&
    w.available &&
    w.enabled &&
    !w.needsReupload &&
    !!w.provider &&
    !!w.model
  );
}

/** A refusal from the server or Rust, by stable code (`ai_vault_disabled`,
 *  `rate_limited`, `server:unreachable`, `AI key not set`…). */
export class WebAccessError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "WebAccessError";
  }
}

const PATH = "/ai/web-access";

function codeOf(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" && code ? code : "";
}

let cached: { at: number; value: WebAccess | null } | null = null;
/** How long a read is reused (every assist button asks whether AI is there). */
const CACHE_MS = 30_000;

/** Forgets the last read (after a change, or on sign-out). */
export function forgetWebAccess() {
  cached = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("pharos:signed-out", forgetWebAccess);
}

/** The account's state on its server. */
export async function fetchWebAccess(): Promise<WebAccess> {
  const value = await serverApi.get<WebAccess>(PATH);
  cached = { at: Date.now(), value };
  return value;
}

/** The last state, read again when older than a few seconds. Null when the
 *  server cannot say (offline, signed out, an older server). */
export async function webAccessNow(): Promise<WebAccess | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  try {
    return await fetchWebAccess();
  } catch {
    cached = { at: Date.now(), value: null };
    return null;
  }
}

/** Removes the copy on the server (desktop or web). */
export async function removeWebAccess(): Promise<void> {
  try {
    await serverApi.remove(PATH, "ai-web-access");
  } finally {
    forgetWebAccess();
  }
}

interface RustResponse {
  status: number;
  body: string;
}

/** Uploads the active provider's key from the keychain (desktop only, after
 *  the user agreed). Rust reads the key and sends it; this code only passes
 *  the session. Renews an expired session once, never under another account. */
export async function uploadWebAccess(
  provider: WebProviderId,
  model: string,
): Promise<WebAccess> {
  if (!isTauri()) throw new WebAccessError("desktop_only");
  const session = await getSession();
  if (!session) throw new WebAccessError("not-authenticated");
  // Rust sends it with the session it keeps for this server, never with a
  // token from here (security review of IA-12).
  const send = async () => {
    try {
      return await invoke<RustResponse>("ai_web_access_upload", { provider, model });
    } catch (e) {
      throw new WebAccessError(typeof e === "string" ? e : "upload_failed");
    }
  };
  try {
    let res = await send();
    if (res.status === 401) {
      // Renewing stores the new session where Rust reads it.
      const renewed = await renewSession(session.accessToken);
      if (renewed?.userId === session.userId) res = await send();
    }
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(res.body) as Record<string, unknown>;
    } catch {
      /* not JSON: keep the status */
    }
    if (res.status < 200 || res.status >= 300) {
      throw new WebAccessError(
        typeof body.code === "string" ? body.code : `http_${res.status}`,
      );
    }
    return body as unknown as WebAccess;
  } finally {
    forgetWebAccess();
  }
}

/** After the desktop stored or removed the key of `provider`: the copy on
 *  the server follows, as the consent said. A new key is uploaded with the
 *  model the web already uses (changing the model asks first, elsewhere). */
export async function followKeyChange(
  provider: OnlineProviderId,
  change: "stored" | "cleared",
): Promise<"updated" | "removed" | "failed" | null> {
  if (!isTauri() || !isWebProvider(provider)) return null;
  let access: WebAccess;
  try {
    access = await fetchWebAccess();
  } catch {
    return null;
  }
  if (!access.enabled || access.provider !== provider) return null;
  try {
    if (change === "cleared") {
      await removeWebAccess();
      return "removed";
    }
    await uploadWebAccess(provider, access.model ?? "");
    return "updated";
  } catch {
    return "failed";
  }
}

/** Whether the server holds a copy of `provider`'s key (desktop: before
 *  removing that key, the confirmation says the copy goes too). */
export async function webCopyOf(provider: OnlineProviderId): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const access = await fetchWebAccess();
    return access.enabled && access.provider === provider;
  } catch {
    return false;
  }
}

/** Text shown for a refusal of the web's AI (in the app language). */
export function webAccessErrorText(code: string): string {
  const key =
    ERROR_TEXTS[code] ?? (code.startsWith("server:") ? "unreachable" : "other");
  return i18n.t(`ai.web.error.${key}`);
}

const ERROR_TEXTS: Record<string, string> = {
  ai_vault_disabled: "disabled",
  ai_web_access_off: "off",
  ai_vault_reupload: "reupload",
  rate_limited: "rateLimited",
  "ai-web-unsupported-provider": "compatible",
  "AI key not set": "noKey",
  "not-authenticated": "signedOut",
};

/** One chat completion through the server with the stored key. Errors are
 *  plain text the assist notice can show: the provider's own message (the
 *  server removes the key from it), its timeout text, or one of ours. */
export async function webChat(
  messages: AiMessage[],
  temperature: number | undefined,
): Promise<{ value: string; provider: WebProviderId; model: string }> {
  const payload = {
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.images?.length
        ? {
            images: m.images.map((i) => ({
              mediaType: i.mediaType,
              data: i.data,
            })),
          }
        : {}),
    })),
    ...(temperature !== undefined ? { temperature } : {}),
  };
  try {
    return await serverApi.post(`/ai/chat`, payload);
  } catch (e) {
    const code = codeOf(e);
    if (code === "ai_provider_error") throw new Error((e as Error).message);
    if (code) {
      // The state changed on the server (removed, master key replaced): read it again.
      forgetWebAccess();
      throw new Error(webAccessErrorText(code));
    }
    throw e;
  }
}
