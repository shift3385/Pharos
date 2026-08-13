import {
  DEFAULT_AI_CONFIG,
  type AiConfig,
  type AiMessage,
  type AiMode,
  type AiStatus,
  type ResolvedProvider,
} from "../model/types";
import { geminiProvider } from "../providers/gemini";
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

export function loadConfig(): AiConfig {
  try {
    return { ...DEFAULT_AI_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
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
  const onlineKeySet = await aiKeys.status("gemini").catch(() => false);
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
    online: status.onlineKeySet && status.online && isTauri(),
    offline: status.ollamaReachable && status.ollamaModelReady,
  });
}

/** Whether any AI provider is usable right now (to enable/disable assist UI). */
export async function aiAvailable(): Promise<boolean> {
  const config = loadConfig();
  return resolveProvider(config, await aiStatus(config)) !== null;
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

/** Redacts a single field from loose notes + context, in the app language.
 *  Reusable by the plan wizard (7B) and the case editor (7C). */
export async function assistDraft(req: AssistRequest): Promise<string> {
  const reply = await aiChat(buildAssistMessages(req));
  return reply.trim();
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
export async function suggestTests(context: string, lang: string): Promise<TestSuggestion[]> {
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
  return parseSuggestions(await aiChat(messages));
}

/** Runs a chat completion through the resolved provider. Throws "no-provider"
 *  when neither online nor offline AI is available (callers disable UI then). */
export async function aiChat(messages: AiMessage[]): Promise<string> {
  const config = loadConfig();
  const status = await aiStatus(config);
  const which = resolveProvider(config, status);
  if (which === "online") {
    return geminiProvider.chat(messages, { model: config.onlineModel, temperature: config.temperature });
  }
  if (which === "offline") {
    return ollamaProvider(config.ollamaEndpoint).chat(messages, {
      model: config.offlineModel,
      temperature: config.temperature,
    });
  }
  throw new Error("no-provider");
}
