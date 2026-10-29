// IA-05 / IA-10 generators against mocked providers: no real keys, no network.
// The online path mocks the Tauri `invoke` (the Rust `ai_chat_online` command);
// the offline path stubs `fetch` for Ollama.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_CONFIG, AI_TIMEOUT_MESSAGE } from "../model/types";
import { saveConfig } from "./aiApi";
import {
  buildCasesFromRequirementMessages,
  generateCasesFromRequirement,
  suggestPreconditions,
  suggestRisks,
  type RequirementBrief,
} from "./generators";
import { AiOutputError, describeAiFailure } from "./structured";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

const req: RequirementBrief = {
  requirementKey: "REQ-007",
  title: "Login with email and password",
  description: "Users sign in with a registered email. Five failed attempts lock the account.",
  priority: "high",
};

const validCases = {
  cases: [
    {
      title: "Successful login",
      description: "A registered user signs in.",
      priority: "high",
      given: ["Given a registered user"],
      when: ["the user signs in with a valid\n password"],
      then: ["the dashboard is shown"],
    },
    {
      title: "Account locked after five failures",
      priority: "critical",
      when: ["the user fails to sign in five times"],
      then: ["the account is locked", "a lock message is shown"],
    },
  ],
};

/** Online provider (Claude) answering through the mocked Rust command. */
function online(reply: () => Promise<unknown>) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  saveConfig({ ...DEFAULT_AI_CONFIG, mode: "online", onlineProvider: "anthropic", temperature: 0.9 });
  invoke.mockImplementation((cmd: string) => {
    if (cmd === "ai_key_status") return Promise.resolve(true);
    if (cmd === "ai_chat_online") return reply();
    return Promise.reject(new Error(`unexpected command ${cmd}`));
  });
}

async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return describeAiFailure(e);
  }
  throw new Error("expected the call to fail");
}

// Braces matter: a function returned from beforeEach runs as a cleanup hook.
beforeEach(() => {
  invoke.mockReset();
});
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("cases from a requirement (IA-05) — prompt", () => {
  it("sends the requirement as data, the language and the exact JSON shape", () => {
    const [system, user] = buildCasesFromRequirementMessages(req, "es");
    expect(system.content).toContain("Spanish");
    expect(system.content).toContain("ONE JSON object");
    expect(user.content).toContain("<data>");
    expect(user.content).toContain("Requirement REQ-007: Login with email and password");
    expect(user.content).toContain("Five failed attempts");
    expect(user.content).toContain('{"cases":[{"title"');
    expect(user.content).toContain('{"cases":[],"reason":"why"}');
    expect(buildCasesFromRequirementMessages(req, "en")[0].content).toContain("English");
  });
});

describe("cases from a requirement (IA-05) — online provider, mocked", () => {
  it("valid JSON: returns the validated cases and the real provider + model", async () => {
    online(async () => "Here they are:\n```json\n" + JSON.stringify(validCases) + "\n```");
    const result = await generateCasesFromRequirement(req, "en");
    expect(result.provenance).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5" });
    expect(result.value).toHaveLength(2);
    // Keyword the model added is dropped, line breaks become spaces, defaults filled.
    expect(result.value[0].given).toEqual(["a registered user"]);
    expect(result.value[0].when).toEqual(["the user signs in with a valid password"]);
    expect(result.value[1]).toMatchObject({ description: "", given: [], priority: "critical" });
    // Structured calls cap the temperature; the requirement reaches the provider.
    const call = invoke.mock.calls.find(([cmd]) => cmd === "ai_chat_online")?.[1] as {
      provider: string;
      temperature: number;
      messages: { content: string }[];
    };
    expect(call.provider).toBe("anthropic");
    expect(call.temperature).toBe(0.3);
    expect(call.messages[1].content).toContain("REQ-007");
  });

  it("invalid JSON: rejected as a whole", async () => {
    online(async () => '{"cases": [{"title": "Broken",}]}');
    expect(await failure(generateCasesFromRequirement(req, "en"))).toEqual({ kind: "invalid-json", details: [] });
  });

  it("valid JSON with the wrong shape: rejected with the failed fields", async () => {
    online(async () => JSON.stringify({ cases: [{ title: "No steps", priority: "high", then: ["x"] }] }));
    const f = await failure(generateCasesFromRequirement(req, "en"));
    expect(f.kind).toBe("invalid-schema");
    expect(f.details.join("\n")).toContain("cases.0.when");
  });

  it("refusal in prose: reported with the model's words", async () => {
    online(async () => "I'm sorry, but I can't help with that.");
    expect(await failure(generateCasesFromRequirement(req, "en"))).toEqual({
      kind: "refusal",
      details: ["I'm sorry, but I can't help with that."],
    });
  });

  it("explicit refusal: an empty list with the reason", async () => {
    online(async () => JSON.stringify({ cases: [], reason: "The requirement has no testable behaviour." }));
    expect(await failure(generateCasesFromRequirement(req, "en"))).toEqual({
      kind: "refusal",
      details: ["The requirement has no testable behaviour."],
    });
  });

  it("timeout: the provider did not answer in time", async () => {
    online(() => Promise.reject(AI_TIMEOUT_MESSAGE));
    expect((await failure(generateCasesFromRequirement(req, "en"))).kind).toBe("timeout");
  });

  it("provider error: its message is kept", async () => {
    online(() => Promise.reject("Anthropic: invalid x-api-key"));
    expect(await failure(generateCasesFromRequirement(req, "en"))).toEqual({
      kind: "provider",
      details: ["Anthropic: invalid x-api-key"],
    });
  });

  it("no AI at all: nothing is sent", async () => {
    saveConfig({ ...DEFAULT_AI_CONFIG, mode: "online" });
    expect((await failure(generateCasesFromRequirement(req, "en"))).kind).toBe("no-provider");
    expect(invoke).not.toHaveBeenCalledWith("ai_chat_online", expect.anything());
  });
});

describe("cases from a requirement (IA-05) — Ollama, mocked", () => {
  function ollama(chat: (body: Record<string, unknown>) => Promise<Response>) {
    saveConfig({ ...DEFAULT_AI_CONFIG, mode: "offline" });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2:3b" }] }), { status: 200 });
      }
      return chat(JSON.parse(String(init?.body)) as Record<string, unknown>);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const reply = (content: string) => new Response(JSON.stringify({ message: { content } }), { status: 200 });

  it("asks for native JSON mode with a capped temperature and reports Ollama + model", async () => {
    let body: Record<string, unknown> = {};
    ollama(async (b) => {
      body = b;
      return reply(JSON.stringify(validCases));
    });
    const result = await generateCasesFromRequirement(req, "es");
    expect(body.format).toBe("json");
    expect(body.options).toEqual({ temperature: 0.3 });
    expect(result.provenance).toMatchObject({ provider: "ollama", model: "llama3.2:3b" });
    expect(result.value.map((c) => c.title)).toEqual(["Successful login", "Account locked after five failures"]);
  });

  it("a local timeout surfaces as the same timeout error", async () => {
    ollama(() => Promise.reject(new DOMException("signal timed out", "TimeoutError")));
    expect((await failure(generateCasesFromRequirement(req, "es"))).kind).toBe("timeout");
  });

  it("plain drafts do not ask for JSON mode", async () => {
    let body: Record<string, unknown> = {};
    ollama(async (b) => {
      body = b;
      return reply("Borrador.");
    });
    const { assistDraft } = await import("./aiApi");
    await assistDraft({ instruction: "x", notes: "", lang: "es" });
    expect(body.format).toBeUndefined();
    expect(body.options).toEqual({ temperature: DEFAULT_AI_CONFIG.temperature });
  });
});

describe("plan and case aids (IA-10), mocked", () => {
  it("risks: validated pairs, the ones already listed are sent to skip", async () => {
    online(async () => JSON.stringify({ risks: [{ risk: "Unstable test environment", mitigation: "Daily smoke" }] }));
    const result = await suggestRisks("Title: Checkout", ["Late requirements"], "en");
    expect(result.value).toEqual([{ risk: "Unstable test environment", mitigation: "Daily smoke" }]);
    const call = invoke.mock.calls.find(([cmd]) => cmd === "ai_chat_online")?.[1] as { messages: { content: string }[] };
    expect(call.messages[1].content).toContain("- Late requirements");
  });

  it("risks: a pair without mitigation is rejected", async () => {
    online(async () => JSON.stringify({ risks: [{ risk: "Unstable environment" }] }));
    await expect(suggestRisks("Title: Checkout", [], "en")).rejects.toBeInstanceOf(AiOutputError);
  });

  it("preconditions: validated strings without a leading keyword; a refusal is reported", async () => {
    online(async () => JSON.stringify({ preconditions: ["The user is registered", "Dado que hay stock"] }));
    expect((await suggestPreconditions("Test case title: Buy", [], "es")).value).toEqual([
      "The user is registered",
      "hay stock",
    ]);
    online(async () => JSON.stringify({ preconditions: [], reason: "Not enough context" }));
    expect(await failure(suggestPreconditions("", [], "es"))).toEqual({
      kind: "refusal",
      details: ["Not enough context"],
    });
  });
});
