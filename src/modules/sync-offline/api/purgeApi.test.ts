import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let session: { userId: string; accessToken: string } | null = { userId: "u1", accessToken: "t" };
vi.mock("@modules/auth", () => ({ getSession: vi.fn(async () => session) }));

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { purgeDeleted } from "./purgeApi";

describe("purgeDeleted (SYNC-06)", () => {
  beforeEach(() => {
    session = { userId: "u1", accessToken: "t" };
    invoke.mockReset();
    invoke.mockResolvedValue({ testCases: 1 });
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("does nothing in the browser", async () => {
    expect(await purgeDeleted(30)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("purges for the signed-in account with the retention days", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(await purgeDeleted(15)).toEqual({ testCases: 1 });
    expect(invoke).toHaveBeenCalledWith("purge_deleted", { userId: "u1", retentionDays: 15 });
  });

  it("does nothing without a session", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    session = null;
    expect(await purgeDeleted(30)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
