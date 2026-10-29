// AI module model (spec §8, IA-08). A provider-agnostic layer: the user picks one
// active online provider (Gemini, OpenAI, Claude, OpenRouter or any OpenAI-
// compatible endpoint), called through Rust so each key stays in the keychain;
// the offline one is Ollama (local, no key). Consumers call the router, never a
// provider directly.

export type AiRole = "system" | "user" | "assistant";

export interface AiMessage {
  role: AiRole;
  content: string;
}

/** Which provider to use: auto picks online when available, else offline. */
export type AiMode = "auto" | "online" | "offline";

/** Online providers, all called through Rust with the user's own key. */
export type OnlineProviderId = "gemini" | "openai" | "anthropic" | "openrouter" | "custom";

export interface OnlineProviderInfo {
  id: OnlineProviderId;
  /** Where the user gets a key (shown as text); null for custom endpoints. */
  keyUrl: string | null;
  /** A local OpenAI-compatible server may not need a key. */
  keyRequired: boolean;
  /** Claude's API rejects `temperature`, so the slider does not apply. */
  supportsTemperature: boolean;
}

export const ONLINE_PROVIDERS: OnlineProviderInfo[] = [
  { id: "gemini", keyUrl: "aistudio.google.com/apikey", keyRequired: true, supportsTemperature: true },
  { id: "openai", keyUrl: "platform.openai.com/api-keys", keyRequired: true, supportsTemperature: true },
  { id: "anthropic", keyUrl: "console.anthropic.com/settings/keys", keyRequired: true, supportsTemperature: false },
  { id: "openrouter", keyUrl: "openrouter.ai/keys", keyRequired: true, supportsTemperature: true },
  { id: "custom", keyUrl: null, keyRequired: false, supportsTemperature: true },
];

export function providerInfo(id: OnlineProviderId): OnlineProviderInfo {
  return ONLINE_PROVIDERS.find((p) => p.id === id) ?? ONLINE_PROVIDERS[0];
}

export interface AiConfig {
  mode: AiMode;
  /** The active online provider. */
  onlineProvider: OnlineProviderId;
  /** Model per online provider, so switching providers keeps each choice. */
  onlineModels: Record<OnlineProviderId, string>;
  /** Base URL of the OpenAI-compatible endpoint (provider "custom"). */
  customBaseUrl: string;
  offlineModel: string;
  temperature: number;
  ollamaEndpoint: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  mode: "auto",
  onlineProvider: "gemini",
  // Empty = pick one with "List models"; only ids known to exist are prefilled.
  onlineModels: {
    gemini: "gemini-2.0-flash",
    openai: "",
    anthropic: "claude-opus-5-5",
    openrouter: "",
    custom: "",
  },
  customBaseUrl: "",
  offlineModel: "llama3.2:3b",
  temperature: 0.7,
  ollamaEndpoint: "http://localhost:11434",
};

export interface AiProvider {
  chat(messages: AiMessage[], opts: { model: string; temperature: number }): Promise<string>;
}

export interface AiStatus {
  /** The active online provider is configured: its key is in the keychain
   *  (custom endpoint: a base URL is set; the key is optional). */
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
export type AiProviderId = OnlineProviderId | "ollama";

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
