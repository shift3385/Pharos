// Tries a typed key from the browser, where there is no Rust core (ADR-0033). The
// key goes straight to the provider, never through the Pharos server, and is not
// stored. Only the connection test uses this: the desktop app keeps every call in
// Rust (`src-tauri/src/ai.rs`), whose URLs, headers and errors this mirrors.
import {
  AI_REQUEST_TIMEOUT_MS,
  AI_TIMEOUT_MESSAGE,
  type AiMessage,
  type OnlineProviderId,
} from "../model/types";

/** Same text as the Rust connection error (`ai.rs`). */
export const AI_CONNECT_MESSAGE = "Could not connect to the AI provider";

/** Room for a short reply after any thinking the model does first. */
const ANTHROPIC_TEST_MAX_TOKENS = 1024;

interface BrowserCall {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** The custom endpoint must be HTTPS; plain HTTP only for this machine, so a key
 *  is never sent unencrypted over the network (same rule as Rust). */
function customBase(raw: string): string {
  const url = raw.trim().replace(/\/+$/, "");
  if (!url) throw new Error("AI base URL not set");
  if (/^https:\/\/./.test(url)) return url;
  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/.test(url)) return url;
  throw new Error("AI base URL must use https (http is only allowed for localhost)");
}

/** The request of one test call (pure — testable). No temperature: a key test
 *  does not need it and some models reject it. */
export function browserTestCall(
  provider: OnlineProviderId,
  baseUrl: string,
  key: string,
  model: string,
  messages: AiMessage[],
): BrowserCall {
  const json = { "content-type": "application/json" };
  switch (provider) {
    case "gemini":
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: { ...json, "x-goog-api-key": key },
        body: { contents: messages.map((m) => ({ role: "user", parts: [{ text: m.content }] })) },
      };
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          ...json,
          "x-api-key": key,
          "anthropic-version": "2026-10-21",
          // Anthropic only answers a browser that declares it knows the key is exposed to it.
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: { model, max_tokens: ANTHROPIC_TEST_MAX_TOKENS, messages },
      };
    default: {
      const base =
        provider === "openai"
          ? "https://api.openai.com/v1"
          : provider === "openrouter"
            ? "https://openrouter.ai/api/v1"
            : customBase(baseUrl);
      return {
        url: `${base}/chat/completions`,
        headers: { ...json, ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: { model, messages },
      };
    }
  }
}

/** The provider's own error message, or a generic one with the HTTP status. */
function errorMessage(data: Record<string, unknown> | null, status: number): string {
  const error = data?.error;
  const nested = error && typeof error === "object" ? (error as { message?: unknown }).message : error;
  const text = [nested, data?.message].find((m) => typeof m === "string" && m.trim());
  return typeof text === "string" ? text.trim() : `AI request failed (HTTP ${status})`;
}

/** The reply text of one test call, or the provider's error (pure — testable). */
export function browserTestReply(
  provider: OnlineProviderId,
  status: number,
  data: Record<string, unknown> | null,
): string {
  if (status < 200 || status >= 300) throw new Error(errorMessage(data, status));
  type Part = { type?: string; text?: string };
  if (provider === "gemini") {
    const candidates = data?.candidates as { content?: { parts?: Part[] } }[] | undefined;
    return (candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  }
  if (provider === "anthropic") {
    if (data?.stop_reason === "refusal") throw new Error("The model declined this request (refusal)");
    const blocks = (data?.content as Part[] | undefined) ?? [];
    return blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  }
  const choices = data?.choices as { message?: { content?: string } }[] | undefined;
  return choices?.[0]?.message?.content ?? "";
}

/** One call to the provider with a typed key. Throws with the provider's message
 *  (bad key, unknown model…), or a plain one if it cannot be reached. */
export async function browserKeyTest(
  provider: OnlineProviderId,
  baseUrl: string,
  key: string,
  model: string,
  messages: AiMessage[],
): Promise<string> {
  const call = browserTestCall(provider, baseUrl, key, model, messages);
  let res: Response;
  try {
    res = await fetch(call.url, {
      method: "POST",
      headers: call.headers,
      body: JSON.stringify(call.body),
      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    if ((e as { name?: string })?.name === "TimeoutError") throw new Error(AI_TIMEOUT_MESSAGE);
    // The browser hides why: no network, or an endpoint that refuses browsers (CORS).
    throw new Error(AI_CONNECT_MESSAGE);
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return browserTestReply(provider, res.status, data);
}
