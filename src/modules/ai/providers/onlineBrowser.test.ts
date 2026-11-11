import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_CONNECT_MESSAGE, browserKeyTest, browserTestCall, browserTestReply } from "./onlineBrowser";
import { AI_TIMEOUT_MESSAGE, type AiMessage, type OnlineProviderId } from "../model/types";

const msgs: AiMessage[] = [{ role: "user", content: "OK?" }];
const call = (provider: OnlineProviderId, baseUrl = "") => browserTestCall(provider, baseUrl, "SECRET", "m", msgs);

afterEach(() => vi.unstubAllGlobals());

describe("browserTestCall", () => {
  it.each<[OnlineProviderId, string, string, string]>([
    ["gemini", "https://generativelanguage.googleapis.com/v1beta/models/m:generateContent", "x-goog-api-key", "SECRET"],
    ["anthropic", "https://api.anthropic.com/v1/messages", "x-api-key", "SECRET"],
    ["openai", "https://api.openai.com/v1/chat/completions", "authorization", "Bearer SECRET"],
    ["openrouter", "https://openrouter.ai/api/v1/chat/completions", "authorization", "Bearer SECRET"],
  ])("%s sends the key in a header, never in the URL or the body", (provider, url, header, value) => {
    const c = call(provider);
    expect(c.url).toBe(url);
    expect(c.headers[header]).toBe(value);
    expect(JSON.stringify(c.body)).not.toContain("SECRET");
  });

  it("Claude declares the browser access, and nobody sends a temperature", () => {
    expect(call("anthropic").headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    for (const p of ["gemini", "anthropic", "openai", "openrouter"] as const) {
      expect(JSON.stringify(call(p).body)).not.toContain("temperature");
    }
  });

  it("a model id cannot change the Gemini path", () => {
    const c = browserTestCall("gemini", "", "k", "a/../b?x=1", msgs);
    expect(c.url).toContain("/models/a%2F..%2Fb%3Fx%3D1:generateContent");
  });

  it("a custom endpoint must be https, or http on this machine", () => {
    expect(call("custom", " https://api.groq.com/openai/v1/ ").url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(call("custom", "http://localhost:1234/v1").url).toBe("http://localhost:1234/v1/chat/completions");
    for (const bad of ["http://example.com/v1", "http://localhost.evil.com", "ftp://x", "https://"]) {
      expect(() => call("custom", bad)).toThrow(/https/);
    }
    expect(() => call("custom", "  ")).toThrow("AI base URL not set");
  });

  it("a custom endpoint may go without a key", () => {
    const c = browserTestCall("custom", "http://localhost:1234/v1", "", "m", msgs);
    expect(c.headers.authorization).toBeUndefined();
  });
});

describe("browserTestReply", () => {
  it("reads the text of each format", () => {
    expect(browserTestReply("gemini", 200, { candidates: [{ content: { parts: [{ text: "Ho" }, { text: "la" }] } }] })).toBe("Hola");
    expect(browserTestReply("anthropic", 200, { content: [{ type: "thinking" }, { type: "text", text: "Hola" }] })).toBe("Hola");
    expect(browserTestReply("openai", 200, { choices: [{ message: { content: "Hola" } }] })).toBe("Hola");
  });

  it("passes on the provider's message, or the status when it gives none", () => {
    expect(() => browserTestReply("anthropic", 401, { error: { message: "invalid x-api-key" } })).toThrow("invalid x-api-key");
    expect(() => browserTestReply("custom", 400, { error: "plain text" })).toThrow("plain text");
    expect(() => browserTestReply("gemini", 500, null)).toThrow("AI request failed (HTTP 500)");
  });

  it("a refusal is an error, not an empty answer", () => {
    expect(() => browserTestReply("anthropic", 200, { stop_reason: "refusal", content: [] })).toThrow("refusal");
  });
});

describe("browserKeyTest", () => {
  const run = () => browserKeyTest("openai", "", "k", "m", msgs);

  it("reports the provider's rejection of a bad key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), { status: 401 })));
    await expect(run()).rejects.toThrow("Incorrect API key");
  });

  it("a reply that is not JSON still says the status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    await expect(run()).rejects.toThrow("HTTP 502");
  });

  it("says plainly when the provider cannot be reached or does not answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(run()).rejects.toThrow(AI_CONNECT_MESSAGE);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("late", "TimeoutError"); }));
    await expect(run()).rejects.toThrow(AI_TIMEOUT_MESSAGE);
  });
});
