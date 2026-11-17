import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SERVER_URL, serverFetch, serverUrl } from "./serverUrl";

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
