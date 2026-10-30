// Model parameters by provider and model (SPEC §8, ADR-0031). The single place
// that says which parameters a model accepts: the Motor de IA tab draws its
// controls from here and the router (aiApi) decides from here what it sends.
// Never repeat these rules in a component.

import type { AiConfig, OnlineProviderId } from "./types";

/** How a model treats `temperature`. */
export type TemperatureSupport = "supported" | "unsupported" | "optional";

export interface TemperatureCapability {
  support: TemperatureSupport;
  min: number;
  max: number;
  step: number;
  /** i18n key of the explanation under the control. */
  note: string;
}

/** «Nivel de razonamiento» (Gemini), «Esfuerzo de razonamiento» (OpenAI,
 *  OpenRouter) or «Esfuerzo» (Claude). */
export type ReasoningKind = "level" | "reasoningEffort" | "effort";

export interface ReasoningCapability {
  kind: ReasoningKind;
  /** Option ids, `ai.params.reasoning.option.<id>`. */
  options: string[];
  /** Pharos sends it. Today no provider call does (later item in ROADMAP), so
   *  the control is locked with «Próximamente» and never listed as ✓. */
  sent: boolean;
}

export interface ModelCapabilities {
  temperature: TemperatureCapability;
  reasoning: ReasoningCapability | null;
}

const RANGE = { min: 0, max: 1, step: 0.1 } as const;

const temperature = (support: TemperatureSupport, note: string): TemperatureCapability => ({
  support,
  ...RANGE,
  note,
});

const reasoning = (kind: ReasoningKind, options: string[]): ReasoningCapability => ({
  kind,
  options,
  sent: false,
});

interface Rule {
  provider: OnlineProviderId;
  /** Model ids this row covers; none = every model of the provider. */
  model?: RegExp;
  caps: ModelCapabilities;
}

/** The first row that matches wins, so specific models go before the catch-all. */
const RULES: Rule[] = [
  {
    provider: "gemini",
    // 2.5 and later, and the `gemini-*-latest` aliases (they follow the newest).
    model: /^gemini-((2\.5|[3-9])|.*-latest$)/i,
    caps: {
      temperature: temperature("supported", "ai.params.note.range"),
      reasoning: reasoning("level", ["auto", "low", "high"]),
    },
  },
  {
    provider: "gemini",
    caps: { temperature: temperature("supported", "ai.params.note.range"), reasoning: null },
  },
  {
    // Reasoning models only accept the default temperature; `gpt-5-chat*` is
    // not a reasoning model and takes it.
    provider: "openai",
    model: /^(o\d|gpt-5(?!-chat))/i,
    caps: {
      temperature: temperature("unsupported", "ai.params.note.modelNoTemperature"),
      reasoning: reasoning("reasoningEffort", ["minimal", "low", "medium", "high"]),
    },
  },
  {
    provider: "openai",
    caps: { temperature: temperature("supported", "ai.params.note.range"), reasoning: null },
  },
  {
    provider: "anthropic",
    caps: {
      temperature: temperature("unsupported", "ai.params.note.claudeNoTemperature"),
      reasoning: reasoning("effort", ["low", "medium", "high"]),
    },
  },
  {
    provider: "openrouter",
    caps: {
      temperature: temperature("supported", "ai.params.note.openrouter"),
      reasoning: reasoning("reasoningEffort", ["low", "medium", "high"]),
    },
  },
  {
    // Nobody can know what an own endpoint accepts: the user decides.
    provider: "custom",
    caps: { temperature: temperature("optional", "ai.params.note.compat"), reasoning: null },
  },
];

export function capabilitiesFor(provider: OnlineProviderId, model: string): ModelCapabilities {
  const id = model.trim();
  const rule = RULES.find((r) => r.provider === provider && (!r.model || r.model.test(id)));
  // Every provider has a catch-all row; this only guards a future provider.
  return rule?.caps ?? { temperature: temperature("supported", "ai.params.note.range"), reasoning: null };
}

/** Whether an online call sends `temperature` with this config. */
export function sendsTemperature(config: AiConfig, provider = config.onlineProvider): boolean {
  const { support } = capabilitiesFor(provider, config.onlineModels[provider]).temperature;
  return support === "supported" || (support === "optional" && config.customSendTemperature);
}
