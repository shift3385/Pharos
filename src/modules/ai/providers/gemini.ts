import type { AiProvider } from "../model/types";

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** Online provider (Google Gemini). The call runs in Rust so the API key stays
 *  in the keychain and never reaches the frontend. */
export const geminiProvider: AiProvider = {
  async chat(messages, opts) {
    return invoke<string>("ai_chat_online", {
      model: opts.model,
      temperature: opts.temperature,
      messages,
    });
  },
};
