import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SERVER_URL, ServerConnectionError, serverFetch, serverUrl } from "./serverUrl";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("serverUrl (SEC-10)", () => {
  it("is the local server when the build names none", () => {
    vi.stubEnv("VITE_API_URL", undefined);
    expect(serverUrl()).toBe(DEFAULT_SERVER_URL);
  });

  it("is the build's VITE_API_URL, without a trailing slash", () => {
    vi.stubEnv("VITE_API_URL", "https://pharos.example.com/");
    expect(serverUrl()).toBe("https://pharos.example.com");
  });
});

describe("serverFetch", () => {
  it("sends the request to the server's route", async () => {
    vi.stubEnv("VITE_API_URL", "https://pharos.example.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const init = { method: "POST", body: "{}" };

    const res = await serverFetch("/auth/login", init);

    expect(res.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledWith("https://pharos.example.com/auth/login", init);
  });

  it.each(["auth/login", "https://elsewhere.example.com/x", "//elsewhere.example.com/x", ""])(
    "never sends %j anywhere",
    async (path) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(serverFetch(path)).rejects.toThrow(/must start with/);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("rejects with fetch's TypeError on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(serverFetch("/health")).rejects.toBeInstanceOf(TypeError);
  });
});

describe("serverFetch on the desktop (through Rust)", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    invokeMock.mockReset();
  });

  it("sends the route, method, headers and body to server_request; never fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    invokeMock.mockResolvedValue({ status: 200, contentType: "application/json", body: '{"ok":true}' });

    const res = await serverFetch("/sync/push", {
      method: "POST",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body: '{"deltas":[]}',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("server_request", {
      request: {
        method: "POST",
        path: "/sync/push",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: '{"deltas":[]}',
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("answers 204 without a body", async () => {
    invokeMock.mockResolvedValue({ status: 204, contentType: null, body: "" });
    const res = await serverFetch("/auth/logout", { method: "POST" });
    expect(res.status).toBe(204);
  });

  it.each(["unreachable", "timeout", "tls"] as const)(
    "turns %s into a TypeError, like fetch",
    async (kind) => {
      invokeMock.mockRejectedValue({ kind, message: kind });
      const error = await serverFetch("/health").catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TypeError);
      expect(error).toBeInstanceOf(ServerConnectionError);
      expect((error as ServerConnectionError).kind).toBe(kind);
    },
  );
});
