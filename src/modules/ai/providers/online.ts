import type { AiProvider, OnlineProviderId } from "../model/types";

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** Online provider (Gemini, OpenAI, Claude, OpenRouter or an OpenAI-compatible
 *  endpoint). The call runs in Rust so the API key stays in the keychain and
 *  never reaches the frontend. */
export function onlineProvider(provider: OnlineProviderId, baseUrl: string): AiProvider {
  return {
    async chat(messages, opts) {
      return invoke<string>("ai_chat_online", {
        provider,
        model: opts.model,
        temperature: opts.temperature ?? null,
        messages,
        baseUrl: baseUrl.trim() || null,
      });
    },
  };
}

/** Models the provider offers to the stored key (throws with the provider's
 *  message on a bad key or URL). */
export function onlineModels(provider: OnlineProviderId, baseUrl: string): Promise<string[]> {
  return invoke<string[]>("ai_list_models", { provider, baseUrl: baseUrl.trim() || null });
}
