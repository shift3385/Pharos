// AI module model (spec §8). A provider-agnostic layer: the online provider is
// Gemini (called through Rust so the key stays in the keychain), the offline one
// is Ollama (local, no key). Consumers call the router, never a provider directly.

export type AiRole = "system" | "user" | "assistant";

export interface AiMessage {
  role: AiRole;
  content: string;
}

/** Which provider to use: auto picks online when available, else offline. */
export type AiMode = "auto" | "online" | "offline";

export interface AiConfig {
  mode: AiMode;
  onlineModel: string;
  offlineModel: string;
  temperature: number;
  ollamaEndpoint: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  mode: "auto",
  onlineModel: "gemini-2.0-flash",
  offlineModel: "llama3.2:3b",
  temperature: 0.7,
  ollamaEndpoint: "http://localhost:11434",
};

export interface AiProvider {
  chat(messages: AiMessage[], opts: { model: string; temperature: number }): Promise<string>;
}

export interface AiStatus {
  /** Gemini API key stored in the keychain. */
  onlineKeySet: boolean;
  /** Browser/OS reports connectivity. */
  online: boolean;
  /** Ollama daemon reachable at the configured endpoint. */
  ollamaReachable: boolean;
  /** The configured offline model is already pulled. */
  ollamaModelReady: boolean;
}

/** The provider the router would use right now (null = none available). */
export type ResolvedProvider = "online" | "offline" | null;

/** The concrete provider that produced a result (IA-01). */
export type AiProviderId = "gemini" | "ollama";

/** Where a request goes (or went): provider + model. Shown before sending and
 *  stored with the result, so the user knows which provider processed what. */
export interface AiDestination {
  provider: AiProviderId;
  model: string;
}

/** Provenance of AI-generated content (IA-01): it stays "pending review" until
 *  a person marks it reviewed. Stored per field in the entity's `data`. */
export interface AiProvenance extends AiDestination {
  generatedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

/** Provenance by field name (e.g. `summary`, `description`, `case`). */
export type ProvenanceMap = Record<string, AiProvenance>;
