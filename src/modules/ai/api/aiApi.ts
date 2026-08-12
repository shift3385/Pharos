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
