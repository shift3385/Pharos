import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_VERSION,
  FEATURES_HEADER,
  MAX_BATCH_BYTES,
  SyncHttpError,
  VERSION_HEADER,
  batchDeltas,
  syncRequest,
  withRetry,
} from "./transport";
import rootPackage from "../../../../package.json";

afterEach(() => vi.unstubAllGlobals());

describe("batchDeltas (FIX-03)", () => {
  it("splits 2,000 changes into ordered batches of at most 200", () => {
    const deltas = Array.from({ length: 2000 }, (_, i) => ({ i }));
    const batches = batchDeltas(deltas);
    expect(batches).toHaveLength(10);
    expect(batches.every((b) => b.length <= 200)).toBe(true);
    expect(batches.flat().map((d) => d.i)).toEqual(deltas.map((d) => d.i));
  });

  it("keeps each request under the byte target; an oversized delta goes alone", () => {
    const big = { text: "x".repeat(MAX_BATCH_BYTES) };
    const small = { text: "x".repeat(200 * 1024) };
    const batches = batchDeltas([small, small, small, big, small]);
    expect(batches.map((b) => b.length)).toEqual([2, 1, 1, 1]);
    for (const b of batches.slice(0, 2))
      expect(JSON.stringify(b).length).toBeLessThan(MAX_BATCH_BYTES);
  });
});

describe("withRetry", () => {
  it("retries network errors and 5xx, then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new SyncHttpError(503, "", "busy"))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, [0, 0, 0])).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a client error such as an unsupported version", async () => {
    const fn = vi.fn().mockRejectedValue(new SyncHttpError(426, "unsupported_client_version", "old"));
    await expect(withRetry(fn, [0, 0])).rejects.toMatchObject({ status: 426 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last retry", async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError("offline"));
    await expect(withRetry(fn, [0, 0])).rejects.toThrow("offline");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("syncRequest (SYNC-08)", () => {
  it("carries the app version from the root package.json", async () => {
    expect(APP_VERSION).toBe(rootPackage.version);
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await syncRequest("/sync/pull?since=0", "tok");
    const headers = fetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers[VERSION_HEADER]).toBe(rootPackage.version);
    expect(headers.authorization).toBe("Bearer tok");
    // DAT-01: tells the server it reads `keyConflicts` (else a taken key is a 426);
    // AUD-01: and that it knows the append-only class.
    expect(headers[FEATURES_HEADER]).toBe("key-conflicts,append-only");
  });

  it("turns the server's refusal into an error with its code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: "unsupported_client_version", message: "Update Pharos" }), { status: 426 }),
      ),
    );
    await expect(syncRequest("/sync/push", "tok", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 426,
      code: "unsupported_client_version",
      message: "Update Pharos",
    });
  });
});
