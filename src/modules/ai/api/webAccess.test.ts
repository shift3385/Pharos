// The desktop's AI key on the web (IA-12, ADR-0034): this code never holds the
// key. The upload goes through Rust with the session only; the web calls the
// server and turns its refusals into text.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@test/utils";
import { DEFAULT_AI_CONFIG } from "../model/types";

const m = vi.hoisted(() => ({
  desktop: true,
  invoke: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  remove: vi.fn(),
  session: vi.fn(async (): Promise<{ accessToken: string; userId: string } | null> => ({ accessToken: "t1", userId: "u1" })),
  renew: vi.fn(async (): Promise<{ accessToken: string; userId: string } | null> => ({ accessToken: "t2", userId: "u1" })),
}));
vi.mock("@shared/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/platform")>()),
  isTauri: () => m.desktop,
  invoke: m.invoke,
}));
vi.mock("@modules/auth", () => ({ getSession: m.session, renewSession: m.renew }));
vi.mock("@modules/sync-offline", () => ({ serverApi: { get: m.get, post: m.post, remove: m.remove } }));

const web = await import("./webAccess");
const { aiChatWithProvenance, aiStatus, resolveProvider, saveConfig } = await import("./aiApi");

const ON = {
  available: true,
  enabled: true,
  provider: "anthropic",
  model: "claude-opus-5-5",
  updatedAt: "2026-11-17T10:42:00.000Z",
  needsReupload: false,
};
const httpError = (status: number, code: string, message = code) => Object.assign(new Error(message), { status, code });

beforeEach(async () => {
  await i18n.changeLanguage("es");
  m.desktop = true;
  for (const f of [m.invoke, m.get, m.post, m.remove, m.session, m.renew]) f.mockReset();
  m.session.mockResolvedValue({ accessToken: "t1", userId: "u1" });
  m.renew.mockResolvedValue({ accessToken: "t2", userId: "u1" });
  web.forgetWebAccess();
  localStorage.clear();
});

describe("uploadWebAccess", () => {
  it("asks Rust to upload with the session only, never a key", async () => {
    m.invoke.mockResolvedValue({ status: 200, body: JSON.stringify(ON) });
    expect(await web.uploadWebAccess("anthropic", "claude-opus-5-5")).toEqual(ON);
    expect(m.invoke).toHaveBeenCalledWith("ai_web_access_upload", {
      provider: "anthropic",
      model: "claude-opus-5-5",
      headers: { authorization: "Bearer t1" },
    });
  });

  it("renews an expired session once, under the same account only", async () => {
    m.invoke.mockResolvedValueOnce({ status: 401, body: "{}" }).mockResolvedValueOnce({ status: 200, body: JSON.stringify(ON) });
    await web.uploadWebAccess("openai", "gpt-5");
    expect(m.invoke.mock.calls[1][1]).toMatchObject({ headers: { authorization: "Bearer t2" } });

    m.invoke.mockReset();
    m.invoke.mockResolvedValue({ status: 401, body: JSON.stringify({ code: "unauthorized" }) });
    m.renew.mockResolvedValue({ accessToken: "t9", userId: "someone-else" });
    await expect(web.uploadWebAccess("openai", "gpt-5")).rejects.toMatchObject({ code: "unauthorized" });
    expect(m.invoke).toHaveBeenCalledOnce();
  });

  it("reports the server's and Rust's refusals by code", async () => {
    m.invoke.mockResolvedValue({ status: 503, body: JSON.stringify({ code: "ai_vault_disabled" }) });
    await expect(web.uploadWebAccess("openai", "gpt-5")).rejects.toMatchObject({ code: "ai_vault_disabled" });
    m.invoke.mockRejectedValue("server:unreachable");
    await expect(web.uploadWebAccess("openai", "gpt-5")).rejects.toMatchObject({ code: "server:unreachable" });
    expect(web.webAccessErrorText("server:tls")).toBe("Sin conexión con el servidor.");
    expect(web.webAccessErrorText("rate_limited")).toMatch(/muchas peticiones/);
  });

  it("is the desktop's only", async () => {
    m.desktop = false;
    await expect(web.uploadWebAccess("openai", "gpt-5")).rejects.toMatchObject({ code: "desktop_only" });
    expect(m.invoke).not.toHaveBeenCalled();
  });
});

describe("followKeyChange", () => {
  it("re-uploads a new key of the provider the web uses, with the web's model", async () => {
    m.get.mockResolvedValue(ON);
    m.invoke.mockResolvedValue({ status: 200, body: JSON.stringify(ON) });
    expect(await web.followKeyChange("anthropic", "stored")).toBe("updated");
    expect(m.invoke.mock.calls[0][1]).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5" });
  });

  it("removes the copy when that key is removed, and leaves other providers alone", async () => {
    m.get.mockResolvedValue(ON);
    expect(await web.followKeyChange("anthropic", "cleared")).toBe("removed");
    expect(m.remove).toHaveBeenCalledWith("/ai/web-access", "ai-web-access");
    m.remove.mockClear();
    expect(await web.followKeyChange("openai", "cleared")).toBeNull();
    expect(await web.followKeyChange("custom", "stored")).toBeNull();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.invoke).not.toHaveBeenCalled();
  });
});

describe("the web uses the server as its online provider", () => {
  beforeEach(() => {
    m.desktop = false;
    saveConfig({ ...DEFAULT_AI_CONFIG, mode: "online" });
  });

  it("with a usable copy, the router picks it and the reply records its provenance", async () => {
    m.get.mockResolvedValue(ON);
    m.post.mockResolvedValue({ value: "Borrador", provider: "anthropic", model: "claude-opus-5-5" });
    const status = await aiStatus({ ...DEFAULT_AI_CONFIG, mode: "online" });
    expect(status.webOnline).toEqual({ provider: "anthropic", model: "claude-opus-5-5" });
    expect(resolveProvider({ ...DEFAULT_AI_CONFIG, mode: "online" }, status)).toBe("online");

    const reply = await aiChatWithProvenance([{ role: "user", content: "hola" }]);
    expect(reply.value).toBe("Borrador");
    expect(reply.provenance).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5" });
    expect(reply.provenance).not.toHaveProperty("viaServer");
    // Claude takes no temperature (capabilities table).
    expect(m.post).toHaveBeenCalledWith("/ai/chat", { messages: [{ role: "user", content: "hola" }] });
  });

  it("without a usable copy there is no online AI", async () => {
    for (const state of [{ ...ON, enabled: false }, { ...ON, needsReupload: true }, { ...ON, available: false }]) {
      web.forgetWebAccess();
      m.get.mockResolvedValue(state);
      const status = await aiStatus({ ...DEFAULT_AI_CONFIG, mode: "online" });
      expect(resolveProvider({ ...DEFAULT_AI_CONFIG, mode: "online" }, status)).toBeNull();
    }
    web.forgetWebAccess();
    m.get.mockRejectedValue(new TypeError("offline"));
    await expect(aiChatWithProvenance([{ role: "user", content: "x" }])).rejects.toThrow("no-provider");
  });

  it("a provider error shows its message; the server's refusals show ours", async () => {
    m.get.mockResolvedValue(ON);
    m.post.mockRejectedValueOnce(httpError(502, "ai_provider_error", "invalid x-api-key"));
    await expect(web.webChat([{ role: "user", content: "x" }], undefined)).rejects.toThrow("invalid x-api-key");
    m.post.mockRejectedValueOnce(httpError(429, "rate_limited"));
    await expect(web.webChat([{ role: "user", content: "x" }], undefined)).rejects.toThrow(/muchas peticiones/);
  });

  it("sends attachments without their file names", async () => {
    m.post.mockResolvedValue({ value: "ok", provider: "openai", model: "gpt-5" });
    await web.webChat([{ role: "user", content: "x", images: [{ mediaType: "image/png", data: "AAAA", name: "pantalla.png" }] }], 0.2);
    expect(m.post).toHaveBeenCalledWith("/ai/chat", {
      messages: [{ role: "user", content: "x", images: [{ mediaType: "image/png", data: "AAAA" }] }],
      temperature: 0.2,
    });
  });
});
