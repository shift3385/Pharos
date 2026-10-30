import { describe, expect, it } from "vitest";
import { capabilitiesFor, sendsTemperature } from "./capabilities";
import { DEFAULT_AI_CONFIG, ONLINE_PROVIDERS, type AiConfig } from "./types";

const config = (patch: Partial<AiConfig>): AiConfig => ({ ...DEFAULT_AI_CONFIG, ...patch });

describe("model capabilities (ADR-0031)", () => {
  it("Claude takes no temperature and its effort is not sent yet", () => {
    const caps = capabilitiesFor("anthropic", "claude-opus-5-5");
    expect(caps.temperature.support).toBe("unsupported");
    expect(caps.temperature.note).toBe("ai.params.note.claudeNoTemperature");
    expect(caps.reasoning).toMatchObject({ kind: "effort", sent: false });
  });

  it("OpenAI reasoning models (o-series, gpt-5) lock the temperature; the others take it", () => {
    expect(capabilitiesFor("openai", "gpt-5").temperature.support).toBe("unsupported");
    expect(capabilitiesFor("openai", "o3-mini").temperature.support).toBe("unsupported");
    expect(capabilitiesFor("openai", "gpt-4o").temperature.support).toBe("supported");
    expect(capabilitiesFor("openai", "gpt-4o").reasoning).toBeNull();
    // gpt-5-chat is not a reasoning model.
    expect(capabilitiesFor("openai", "gpt-5-chat-latest").temperature.support).toBe("supported");
  });

  it("Gemini 2.5+ has a reasoning level; older models do not", () => {
    expect(capabilitiesFor("gemini", "gemini-2.5-pro").reasoning?.options).toEqual(["auto", "low", "high"]);
    expect(capabilitiesFor("gemini", "gemini-2.0-flash").reasoning).toBeNull();
    expect(capabilitiesFor("gemini", "gemini-flash-latest").reasoning?.kind).toBe("level");
  });

  it("Compatible makes the temperature optional", () => {
    expect(capabilitiesFor("custom", "qwen").temperature.support).toBe("optional");
  });

  it("every provider has a row and no reasoning parameter is sent today", () => {
    for (const p of ONLINE_PROVIDERS) {
      const caps = capabilitiesFor(p.id, "");
      expect(caps.temperature.max).toBeGreaterThan(caps.temperature.min);
      expect(caps.reasoning?.sent ?? false).toBe(false);
    }
  });

  it("sendsTemperature follows the table and the «Enviar» switch", () => {
    expect(sendsTemperature(config({ onlineProvider: "gemini" }))).toBe(true);
    expect(sendsTemperature(config({ onlineProvider: "anthropic" }))).toBe(false);
    expect(sendsTemperature(config({ onlineProvider: "custom" }))).toBe(false);
    expect(sendsTemperature(config({ onlineProvider: "custom", customSendTemperature: true }))).toBe(true);
  });
});
