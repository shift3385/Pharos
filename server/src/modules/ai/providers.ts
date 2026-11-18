// Calls to the AI providers from the server (IA-12, ADR-0034), with the key
// from the vault. Same requests as the desktop's Rust core (`src-tauri/src/
// ai.rs`): Gemini `generateContent`, OpenAI-style chat completions (OpenAI,
// OpenRouter) and the Anthropic Messages API. «Compatible» (a user-given URL)
// is left out on purpose: the server would reach any address its network can,
// internal ones included.
//
// The key only goes in a header, never in a URL; no redirect is followed (a
// redirect would carry the header elsewhere); and every error that leaves this
// file is a fixed text or the provider's message with the key scrubbed out.
import { z } from "zod";

export const WEB_PROVIDERS = ["gemini", "openai", "anthropic", "openrouter"] as const;
export type WebProvider = (typeof WEB_PROVIDERS)[number];

const BASE_URL: Record<WebProvider, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const ANTHROPIC_VERSION = "2026-10-21";
const ANTHROPIC_MAX_TOKENS = 16000;
const ANTHROPIC_FALLBACK_BETA = "server-side-fallback-2026-07-01";
const ANTHROPIC_FALLBACK_MODELS = ["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"];

/** Same limit as the desktop (`REQUEST_TIMEOUT` in ai.rs). */
export const AI_REQUEST_TIMEOUT_MS = 120_000;

/** Model ids go into the body (and, for Gemini, the URL path): only the
 *  characters real ids use (same rule as ai.rs). */
export function validModel(provider: WebProvider, model: string): boolean {
  const allowed = provider === "gemini" ? /^[A-Za-z0-9\-._:@]+$/ : /^[A-Za-z0-9\-._:@/]+$/;
  return model.length > 0 && model.length <= 200 && allowed.test(model);
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"] as const;
const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BASE64 = 16_000_000;

export const messagesSchema = z
  .array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string().max(400_000),
      images: z
        .array(
          z.object({
            mediaType: z.enum(IMAGE_TYPES),
            data: z.string().min(1).regex(/^[A-Za-z0-9+/=]+$/),
          }),
        )
        .optional(),
    }),
  )
  .min(1)
  .max(200)
  .superRefine((messages, ctx) => {
    let count = 0;
    let total = 0;
    for (const m of messages) {
      if (!m.images?.length) continue;
      if (m.role !== "user") ctx.addIssue({ code: "custom", message: "Images can only go in a user message" });
      count += m.images.length;
      total += m.images.reduce((n, i) => n + i.data.length, 0);
    }
    if (count > MAX_ATTACHMENTS) ctx.addIssue({ code: "custom", message: `Too many attachments (at most ${MAX_ATTACHMENTS})` });
    if (total > MAX_ATTACHMENT_BASE64) ctx.addIssue({ code: "custom", message: "The attachments are too large for one request" });
  });

export type ChatMessage = z.infer<typeof messagesSchema>[number];

export interface HttpCall {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function authHeaders(provider: WebProvider, key: string): Record<string, string> {
  switch (provider) {
    case "gemini":
      return { "x-goog-api-key": key };
    case "anthropic":
      return { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION };
    case "openrouter":
      return { authorization: `Bearer ${key}`, "x-title": "Pharos" };
    default:
      return { authorization: `Bearer ${key}` };
  }
}

const geminiParts = (m: ChatMessage) => [
  { text: m.content },
  ...(m.images ?? []).map((i) => ({ inline_data: { mime_type: i.mediaType, data: i.data } })),
];

function anthropicContent(m: ChatMessage): unknown {
  if (!m.images?.length) return m.content;
  return [
    ...m.images.map((i) => ({
      type: i.mediaType === "application/pdf" ? "document" : "image",
      source: { type: "base64", media_type: i.mediaType, data: i.data },
    })),
    { type: "text", text: m.content },
  ];
}

function openaiContent(m: ChatMessage): unknown {
  if (!m.images?.length) return m.content;
  return [
    { type: "text", text: m.content },
    ...m.images.map((i, n) => {
      const url = `data:${i.mediaType};base64,${i.data}`;
      return i.mediaType === "application/pdf"
        ? { type: "file", file: { filename: `document-${n + 1}.pdf`, file_data: url } }
        : { type: "image_url", image_url: { url } };
    }),
  ];
}

/** The chat request (pure — testable). `temperature: undefined` omits it. */
export function chatCall(
  provider: WebProvider,
  key: string,
  model: string,
  temperature: number | undefined,
  messages: ChatMessage[],
): HttpCall {
  const base = BASE_URL[provider];
  const headers = { "content-type": "application/json", ...authHeaders(provider, key) };
  const system = messages.filter((m) => m.role === "system").map((m) => m.content);
  const turns = messages.filter((m) => m.role !== "system");
  if (provider === "gemini") {
    const body: Record<string, unknown> = {
      contents: turns.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: geminiParts(m) })),
    };
    if (temperature !== undefined) body.generationConfig = { temperature };
    if (system.length) body.systemInstruction = { parts: [{ text: system.join("\n\n") }] };
    return { url: `${base}/models/${model}:generateContent`, headers, body };
  }
  if (provider === "anthropic") {
    const body: Record<string, unknown> = {
      model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: turns.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: anthropicContent(m) })),
    };
    if (system.length) body.system = system.join("\n\n");
    if (ANTHROPIC_FALLBACK_MODELS.includes(model)) {
      Object.assign(headers, { "anthropic-beta": ANTHROPIC_FALLBACK_BETA });
      body.fallbacks = "default";
    }
    return { url: `${base}/messages`, headers, body };
  }
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: openaiContent(m) })),
  };
  if (temperature !== undefined) body.temperature = temperature;
  return { url: `${base}/chat/completions`, headers, body };
}

type Json = Record<string, unknown> | null;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** The provider's own error text, or a generic one with the HTTP status. */
export function providerMessage(val: Json, status: number): string {
  const error = obj(val).error;
  const msg = typeof error === "string" ? error : obj(error).message ?? obj(val).message;
  return typeof msg === "string" && msg.trim() ? msg.trim() : `AI request failed (HTTP ${status})`;
}

/** The reply text of a 2xx answer (pure — testable). */
export function parseChat(provider: WebProvider, val: Json): string {
  if (provider === "gemini") {
    const candidates = obj(val).candidates;
    const first = Array.isArray(candidates) ? candidates[0] : null;
    const parts = obj(obj(first).content).parts;
    return Array.isArray(parts) ? parts.map((p) => (typeof obj(p).text === "string" ? (obj(p).text as string) : "")).join("") : "";
  }
  if (provider === "anthropic") {
    if (obj(val).stop_reason === "refusal") throw new ProviderError("The model declined this request (refusal)", "refusal");
    const blocks = obj(val).content;
    return Array.isArray(blocks)
      ? blocks.filter((b) => obj(b).type === "text").map((b) => String(obj(b).text ?? "")).join("")
      : "";
  }
  const choices = obj(val).choices;
  const content = Array.isArray(choices) ? obj(obj(choices[0]).message).content : undefined;
  return typeof content === "string" ? content : "";
}

/** Removes the key, and anything that looks like a provider key, from a text
 *  that will leave the server. Some providers quote part of a rejected key. */
export function scrub(text: string, key: string): string {
  let out = text;
  if (key) {
    out = out.split(key).join("[redacted]");
    // A provider may quote the start or the end of the key.
    for (const n of [12, 8]) {
      if (key.length > n * 2) {
        out = out.split(key.slice(0, n)).join("[redacted]").split(key.slice(-n)).join("[redacted]");
      }
    }
  }
  return out
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_*.-]{6,}/g, "[redacted]")
    .replace(/\bAIza[A-Za-z0-9_-]{10,}/g, "[redacted]")
    .slice(0, 500);
}

export type ProviderErrorKind = "key_rejected" | "provider" | "timeout" | "unreachable" | "refusal";

/** An error safe to show: its message never holds the key. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const KEY_REJECTION = /api[ -_]?key|authenticat|unauthori[sz]ed|permission denied|invalid x-api-key/i;

export type Fetch = typeof fetch;

async function send(call: HttpCall, fetchImpl: Fetch): Promise<{ status: number; val: Json }> {
  let res: Response;
  try {
    res = await fetchImpl(call.url, {
      method: "POST",
      headers: call.headers,
      body: JSON.stringify(call.body),
      redirect: "error",
      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new ProviderError("The AI provider did not answer in time", "timeout");
    }
    throw new ProviderError("Could not connect to the AI provider", "unreachable");
  }
  let val: Json = null;
  try {
    val = obj(JSON.parse(await res.text()));
  } catch {
    val = null;
  }
  if (val === null && res.ok) {
    throw new ProviderError(`Unexpected response from the AI provider (HTTP ${res.status})`, "provider", res.status);
  }
  return { status: res.status, val };
}

function failure(val: Json, status: number, key: string): ProviderError {
  const message = scrub(providerMessage(val, status), key);
  const rejected = status === 401 || status === 403 || KEY_REJECTION.test(message);
  return new ProviderError(message, rejected ? "key_rejected" : "provider", status);
}

/** One chat completion. Throws `ProviderError` only. */
export async function chat(
  provider: WebProvider,
  key: string,
  model: string,
  temperature: number | undefined,
  messages: ChatMessage[],
  fetchImpl: Fetch = fetch,
): Promise<string> {
  const temp = provider === "anthropic" ? undefined : temperature;
  let { status, val } = await send(chatCall(provider, key, model, temp, messages), fetchImpl);
  // Some OpenAI-style models only take the default temperature: retry once without.
  if (
    provider !== "gemini" &&
    provider !== "anthropic" &&
    temp !== undefined &&
    status === 400 &&
    providerMessage(val, status).toLowerCase().includes("temperature")
  ) {
    ({ status, val } = await send(chatCall(provider, key, model, undefined, messages), fetchImpl));
  }
  if (status < 200 || status >= 300) throw failure(val, status, key);
  return parseChat(provider, val);
}
