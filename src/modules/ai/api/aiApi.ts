import {
  DEFAULT_AI_CONFIG,
  ONLINE_PROVIDERS,
  providerInfo,
  type AiConfig,
  type AiDestination,
  type AiMessage,
  type AiMode,
  type AiProvenance,
  type AiStatus,
  type OnlineProviderId,
  type ResolvedProvider,
} from "../model/types";
import { newProvenance } from "../model/provenance";
import { onlineModels, onlineProvider } from "../providers/online";
import { ollamaModels, ollamaProvider } from "../providers/ollama";

const CONFIG_KEY = "pharos.ai.config";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// --- non-secret config (localStorage) ----------------------------------------

/** Merges a stored config over the defaults (pure — testable). Configs saved
 *  before IA-08 had a single Gemini `onlineModel`; it becomes the Gemini model. */
export function normalizeConfig(stored: unknown): AiConfig {
  const raw = (stored && typeof stored === "object" ? stored : {}) as Partial<AiConfig> & {
    onlineModel?: unknown;
  };
  const { onlineModel, ...rest } = raw;
  const models = { ...DEFAULT_AI_CONFIG.onlineModels, ...(raw.onlineModels ?? {}) };
  if (typeof onlineModel === "string" && !raw.onlineModels) models.gemini = onlineModel;
  const provider = ONLINE_PROVIDERS.some((p) => p.id === raw.onlineProvider)
    ? (raw.onlineProvider as OnlineProviderId)
    : DEFAULT_AI_CONFIG.onlineProvider;
  return { ...DEFAULT_AI_CONFIG, ...rest, onlineProvider: provider, onlineModels: models };
}

export function loadConfig(): AiConfig {
  try {
    return normalizeConfig(JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "{}"));
  } catch {
    return normalizeConfig({});
  }
}
export function saveConfig(config: AiConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

// --- API keys (keychain via Rust; no-op in the browser fallback) -------------

export const aiKeys = {
  set: (provider: string, key: string): Promise<void> =>
    isTauri() ? invoke("ai_key_set", { provider, key }) : Promise.resolve(),
  status: (provider: string): Promise<boolean> =>
    isTauri() ? invoke<boolean>("ai_key_status", { provider }) : Promise.resolve(false),
  clear: (provider: string): Promise<void> =>
    isTauri() ? invoke("ai_key_clear", { provider }) : Promise.resolve(),
};

/** Models the active provider offers to the stored key (desktop only). */
export function aiListModels(provider: OnlineProviderId, baseUrl: string): Promise<string[]> {
  return isTauri() ? onlineModels(provider, baseUrl) : Promise.resolve([]);
}

/** The model chosen for the active online provider. */
export function activeOnlineModel(config: AiConfig): string {
  return config.onlineModels[config.onlineProvider]?.trim() ?? "";
}

/** Whether the active online provider has what it needs to be called: its key
 *  (custom endpoint: a base URL; the key is optional). */
export async function onlineConfigured(config: AiConfig): Promise<boolean> {
  const info = providerInfo(config.onlineProvider);
  if (!info.keyRequired) return config.customBaseUrl.trim() !== "";
  return aiKeys.status(config.onlineProvider).catch(() => false);
}

// --- routing -----------------------------------------------------------------

/** Pure decision: which provider to use given the mode and what's available. */
export function pickProvider(
  mode: AiMode,
  avail: { online: boolean; offline: boolean },
): ResolvedProvider {
  if (mode === "online") return avail.online ? "online" : null;
  if (mode === "offline") return avail.offline ? "offline" : null;
  if (avail.online) return "online"; // auto: prefer online, fall back to local
  if (avail.offline) return "offline";
  return null;
}

/** Probes provider availability (key set, connectivity, Ollama + model). */
export async function aiStatus(config: AiConfig): Promise<AiStatus> {
  const onlineKeySet = await onlineConfigured(config);
  const online = typeof navigator !== "undefined" ? navigator.onLine : false;
  let ollamaReachable = false;
  let ollamaModelReady = false;
  try {
    const models = await ollamaModels(config.ollamaEndpoint);
    ollamaReachable = true;
    ollamaModelReady = models.some(
      (m) => m === config.offlineModel || m.startsWith(`${config.offlineModel}:`),
    );
  } catch {
    /* Ollama not running */
  }
  return { onlineKeySet, online, ollamaReachable, ollamaModelReady };
}

/** The provider the router would pick right now. */
export function resolveProvider(config: AiConfig, status: AiStatus): ResolvedProvider {
  return pickProvider(config.mode, {
    online: status.onlineKeySet && status.online && isTauri() && activeOnlineModel(config) !== "",
    offline: status.ollamaReachable && status.ollamaModelReady,
  });
}

/** Whether any AI provider is usable right now (to enable/disable assist UI). */
export async function aiAvailable(): Promise<boolean> {
  const config = loadConfig();
  return resolveProvider(config, await aiStatus(config)) !== null;
}

/** Maps the router's choice to the concrete provider + model (pure). */
export function destinationFor(which: ResolvedProvider, config: AiConfig): AiDestination | null {
  if (which === "online") return { provider: config.onlineProvider, model: activeOnlineModel(config) };
  if (which === "offline") return { provider: "ollama", model: config.offlineModel };
  return null;
}

/** Where an AI request would go right now (null when no AI is available), so
 *  the UI can say which provider will process the data before sending it. */
export async function aiDestination(): Promise<AiDestination | null> {
  const config = loadConfig();
  return destinationFor(resolveProvider(config, await aiStatus(config)), config);
}

/** A drafting request for the "Assist with AI" buttons. */
export interface AssistRequest {
  /** What to write, e.g. "the Summary section of a software test plan". */
  instruction: string;
  /** Loose notes / current field content to base the draft on (may be empty). */
  notes: string;
  /** App language for the reply ("es" | "en" | ...). */
  lang: string;
  /** Optional extra context (plan title, scope, types…). */
  context?: string;
}

/** Builds the chat messages for an assist request (pure — testable). */
export function buildAssistMessages(req: AssistRequest): AiMessage[] {
  const language = req.lang.startsWith("es") ? "Spanish" : "English";
  const system: AiMessage = {
    role: "system",
    content:
      `You are a QA documentation assistant. Write clear, professional ${language} ` +
      `prose for a software test plan or test case. Return ONLY the requested text: ` +
      `plain text, no markdown, no headings, no preamble, no quotes.`,
  };
  const parts = [`Write ${req.instruction}.`];
  if (req.context?.trim()) parts.push(`Context:\n${req.context.trim()}`);
  parts.push(
    req.notes.trim()
      ? `Base it on these notes:\n${req.notes.trim()}`
      : `There are no notes; infer a reasonable, generic draft.`,
  );
  return [system, { role: "user", content: parts.join("\n\n") }];
}

/** AI output together with its provenance (IA-01). */
export interface AiResult<T> {
  value: T;
  provenance: AiProvenance;
}

/** Redacts a single field from loose notes + context, in the app language.
 *  Reusable by the plan wizard (7B) and the case editor (7C). */
export async function assistDraft(req: AssistRequest): Promise<AiResult<string>> {
  const reply = await aiChatWithProvenance(buildAssistMessages(req));
  return { value: reply.value.trim(), provenance: reply.provenance };
}

/** A suggested test case (title + one-line description) from the plan. */
export interface TestSuggestion {
  title: string;
  description: string;
}

/** Extracts a JSON array of {title, description} from a model reply, tolerating
 *  code fences and surrounding prose. */
export function parseSuggestions(reply: string): TestSuggestion[] {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(reply.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        return {
          title: String(o.title ?? o.name ?? "").trim(),
          description: String(o.description ?? o.desc ?? "").trim(),
        };
      })
      .filter((s) => s.title);
  } catch {
    return [];
  }
}

/** Suggests test cases for a plan context, in the app language (spec §5.2). */
export async function suggestTests(
  context: string,
  lang: string,
): Promise<AiResult<TestSuggestion[]>> {
  const language = lang.startsWith("es") ? "Spanish" : "English";
  const messages: AiMessage[] = [
    {
      role: "system",
      content: `You are a QA test analyst. Propose concrete test cases for a software test plan. Respond in ${language}.`,
    },
    {
      role: "user",
      content:
        `Based on this test plan, propose 5 to 10 test cases to write. Return ONLY a JSON ` +
        `array; each item is an object with "title" (short, specific) and "description" ` +
        `(one sentence). No markdown, no code fences, no extra text.\n\n${context}`,
    },
  ];
  const reply = await aiChatWithProvenance(messages);
  return { value: parseSuggestions(reply.value), provenance: reply.provenance };
}

/** Runs a chat completion through the resolved provider and records which
 *  provider + model produced the reply (IA-01). Throws "no-provider" when
 *  neither online nor offline AI is available (callers disable UI then).
 *  Online errors are the provider's own message (bad key, unknown model…). */
export async function aiChatWithProvenance(messages: AiMessage[]): Promise<AiResult<string>> {
  const config = loadConfig();
  const status = await aiStatus(config);
  const which = resolveProvider(config, status);
  const destination = destinationFor(which, config);
  if (!destination) throw new Error("no-provider");
  const opts = { model: destination.model, temperature: config.temperature };
  const value =
    destination.provider === "ollama"
      ? await ollamaProvider(config.ollamaEndpoint).chat(messages, opts)
      : await onlineProvider(destination.provider, config.customBaseUrl).chat(messages, opts);
  return { value, provenance: newProvenance(destination) };
}

/** Plain chat completion (no provenance), e.g. the connection test. */
export async function aiChat(messages: AiMessage[]): Promise<string> {
  return (await aiChatWithProvenance(messages)).value;
}
