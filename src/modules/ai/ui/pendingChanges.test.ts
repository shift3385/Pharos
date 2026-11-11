import { describe, expect, it } from "vitest";
import { pendingChanges } from "./pendingChanges";
import { DEFAULT_AI_CONFIG as base } from "../model/types";

describe("pendingChanges", () => {
  it("nothing pending when the form is what is saved", () => {
    expect(pendingChanges({ ...base }, base, false)).toEqual([]);
  });

  it("names each change, in the order of the screen", () => {
    const draft = {
      ...base,
      mode: "online" as const,
      onlineProvider: "custom" as const,
      customBaseUrl: "https://x.dev/v1",
      onlineModels: { ...base.onlineModels, custom: "m" },
      temperature: 0.2,
      ollamaEndpoint: "http://localhost:1",
    };
    expect(pendingChanges(draft, base, true)).toEqual(["mode", "provider", "baseUrl", "key", "model", "temperature", "ollama"]);
  });

  it("each setting counts once, whichever of its values changed", () => {
    expect(pendingChanges({ ...base, customSendTemperature: !base.customSendTemperature }, base, false)).toEqual(["temperature"]);
    expect(pendingChanges({ ...base, offlineModel: "otro" }, base, false)).toEqual(["ollama"]);
  });

  it("a choice undone is no longer pending", () => {
    const back = { ...base, onlineProvider: "gemini" as const };
    expect(pendingChanges(back, base, false)).toEqual([]);
  });
});
