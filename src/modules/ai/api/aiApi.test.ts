import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeOnlineModel,
  aiTestKey,
  buildAssistMessages,
  destinationFor,
  isKeyRejection,
  loadConfig,
  normalizeConfig,
  parseSuggestions,
  pickProvider,
  saveConfig,
} from "./aiApi";
import { DEFAULT_AI_CONFIG, ONLINE_PROVIDERS, providerInfo } from "../model/types";

const tauri = vi.hoisted(() => ({
  desktop: false,
  invoke: vi.fn(async (_cmd: string, _args?: Record<string, unknown>): Promise<unknown> => "OK"),
}));
vi.mock("@shared/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/platform")>()),
  isTauri: () => tauri.desktop,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));

describe("aiTestKey", () => {
  const msgs = [{ role: "user" as const, content: "OK?" }];

  beforeEach(() => {
    tauri.desktop = true;
    tauri.invoke.mockClear();
  });

  it("sends the typed key with the given form, and only what the model accepts", async () => {
    await aiTestKey({ ...DEFAULT_AI_CONFIG, onlineProvider: "anthropic" }, "sk-new", msgs);
    expect(tauri.invoke).toHaveBeenCalledOnce();
    expect(tauri.invoke).toHaveBeenCalledWith("ai_key_test", {
      provider: "anthropic",
      key: "sk-new",
      model: "claude-opus-5-5",
      temperature: null, // Claude does not accept it.
      messages: msgs,
      baseUrl: null,
    });

    await aiTestKey(DEFAULT_AI_CONFIG, "k", msgs);
    expect(tauri.invoke.mock.lastCall?.[1]).toMatchObject({ provider: "gemini", temperature: 0.7 });
  });

  it("on the web, asks the provider from the browser and reports its answer", async () => {
    tauri.desktop = false;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ error: { message: "API key not valid." } }), { status: 400 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(aiTestKey(DEFAULT_AI_CONFIG, "bad", msgs)).rejects.toThrow("API key not valid.");
    expect(fetchMock.mock.calls[0][0]).toContain("/models/gemini-2.0-flash:generateContent");
    expect(tauri.invoke).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("isKeyRejection", () => {
  it.each([
    "invalid x-api-key",
    "API key not valid. Please pass a valid API key.",
    "Incorrect API key provided: sk-****",
    "Missing Authentication header",
    "Unauthorized",
  ])("recognises %s", (message) => expect(isKeyRejection(message)).toBe(true));

  it.each(["The model `nope` does not exist", "Could not connect to the AI provider", "AI request failed (HTTP 500)"])(
    "does not blame the key for %s",
    (message) => expect(isKeyRejection(message)).toBe(false),
  );
});

describe("pickProvider", () => {
  it("auto prefers online when available, else offline", () => {
    expect(pickProvider("auto", { online: true, offline: true })).toBe("online");
    expect(pickProvider("auto", { online: false, offline: true })).toBe("offline");
    expect(pickProvider("auto", { online: false, offline: false })).toBeNull();
  });

  it("respects a forced online/offline mode and reports null when unavailable", () => {
    expect(pickProvider("online", { online: true, offline: true })).toBe("online");
    expect(pickProvider("online", { online: false, offline: true })).toBeNull();
    expect(pickProvider("offline", { online: true, offline: false })).toBeNull();
    expect(pickProvider("offline", { online: true, offline: true })).toBe("offline");
  });
});

describe("buildAssistMessages", () => {
  it("builds a system + user message in the requested language, with notes", () => {
    const msgs = buildAssistMessages({
      instruction: "the Summary section of a software test plan",
      notes: "checkout flow, focus on payment",
      lang: "es",
      context: "Title: Checkout",
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("Spanish");
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toContain("the Summary section");
    expect(msgs[1].content).toContain("Title: Checkout");
    expect(msgs[1].content).toContain("checkout flow, focus on payment");
  });

  it("asks for a direct, brief text with no invented facts (IA-15)", () => {
    const [system] = buildAssistMessages({ instruction: "the Purpose section", notes: "", lang: "es" });
    expect(system.content).toContain("direct, precise and brief");
    expect(system.content).toContain("at most 3 short sentences");
    expect(system.content).toContain("no names, dates or figures");
  });

  it("falls back to inferring a draft when there are no notes; English for en", () => {
    const msgs = buildAssistMessages({
      instruction: "the Purpose section",
      notes: "   ",
      lang: "en",
    });
    expect(msgs[0].content).toContain("English");
    expect(msgs[1].content).toContain("no notes");
  });
});

describe("parseSuggestions", () => {
  it("parses a JSON array, tolerating code fences and prose", () => {
    const reply =
      "Here you go:\n```json\n[{\"title\":\"Login OK\",\"description\":\"Valid creds\"}," +
      "{\"title\":\"Login fail\",\"description\":\"Bad password\"}]\n```";
    const out = parseSuggestions(reply);
    expect(out).toEqual([
      { title: "Login OK", description: "Valid creds" },
      { title: "Login fail", description: "Bad password" },
    ]);
  });

  it("drops items without a title and returns [] on garbage", () => {
    expect(parseSuggestions('[{"description":"no title"},{"title":"Keep"}]')).toEqual([
      { title: "Keep", description: "" },
    ]);
    expect(parseSuggestions("not json at all")).toEqual([]);
  });
});

describe("ai config persistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing is stored", () => {
    expect(loadConfig()).toEqual(DEFAULT_AI_CONFIG);
  });

  it("round-trips saved config and merges over defaults", () => {
    saveConfig({ ...DEFAULT_AI_CONFIG, mode: "offline", temperature: 0.2 });
    const cfg = loadConfig();
    expect(cfg.mode).toBe("offline");
    expect(cfg.temperature).toBe(0.2);
    expect(cfg.offlineModel).toBe(DEFAULT_AI_CONFIG.offlineModel); // untouched default
  });

  it("migrates a pre-IA-08 config: its single model becomes the Gemini model", () => {
    localStorage.setItem(
      "pharos.ai.config",
      JSON.stringify({ mode: "online", onlineModel: "gemini-1.5-pro", temperature: 0.4 }),
    );
    const cfg = loadConfig();
    expect(cfg.onlineProvider).toBe("gemini");
    expect(cfg.onlineModels.gemini).toBe("gemini-1.5-pro");
    expect(cfg.onlineModels.anthropic).toBe(DEFAULT_AI_CONFIG.onlineModels.anthropic);
    expect(cfg).not.toHaveProperty("onlineModel");
    expect(cfg.mode).toBe("online");
  });

  it("keeps each provider's model and rejects an unknown provider", () => {
    const cfg = normalizeConfig({
      onlineProvider: "evil",
      onlineModels: { openai: "gpt-x" },
    });
    expect(cfg.onlineProvider).toBe("gemini");
    expect(cfg.onlineModels.openai).toBe("gpt-x");
    expect(cfg.onlineModels.gemini).toBe(DEFAULT_AI_CONFIG.onlineModels.gemini);
    expect(normalizeConfig("garbage")).toEqual(DEFAULT_AI_CONFIG);
  });

  it("«Compatible» keeps sending the temperature for configs saved before «Enviar» (ADR-0031)", () => {
    // A stored config without the field: the old behaviour (always sent).
    expect(normalizeConfig({ onlineProvider: "custom", customBaseUrl: "https://x/v1" }).customSendTemperature).toBe(true);
    // No stored config: a new user starts with it off.
    expect(normalizeConfig({}).customSendTemperature).toBe(false);
    // An explicit choice always wins.
    expect(normalizeConfig({ onlineProvider: "custom", customSendTemperature: false }).customSendTemperature).toBe(false);
  });
});

describe("active online provider", () => {
  it("routes online requests to the selected provider and its model", () => {
    const cfg = normalizeConfig({ onlineProvider: "anthropic" });
    expect(activeOnlineModel(cfg)).toBe("claude-opus-5-5");
    expect(destinationFor("online", cfg)).toEqual({ provider: "anthropic", model: "claude-opus-5-5" });
    expect(destinationFor("offline", cfg)).toEqual({ provider: "ollama", model: cfg.offlineModel });
    expect(destinationFor(null, cfg)).toBeNull();
  });

  it("has no model until the user picks one for providers without a known default", () => {
    expect(activeOnlineModel(normalizeConfig({ onlineProvider: "openrouter" }))).toBe("");
    expect(activeOnlineModel(normalizeConfig({ onlineProvider: "openai", onlineModels: { openai: "  m  " } }))).toBe("m");
  });

  it("describes each provider: Claude ignores temperature, custom needs no key", () => {
    expect(ONLINE_PROVIDERS.map((p) => p.id)).toEqual(["gemini", "openai", "anthropic", "openrouter", "custom"]);
    expect(providerInfo("custom").keyRequired).toBe(false);
    expect(providerInfo("custom").keyUrl).toBeNull();
    expect(providerInfo("openai").keyRequired).toBe(true);
  });
});
