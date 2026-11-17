// SYNC-09: language, theme and appearance follow the account; the profile
// names too, the newer change winning.
import { beforeEach, describe, expect, it, vi } from "vitest";

const stored = new Map<string, { value: unknown; updatedAt: string; pending: boolean }>();
const save = vi.fn(async (_u: string, key: string, value: unknown) => {
  stored.set(key, { value, updatedAt: "now", pending: false });
});
vi.mock("./accountPreferences", () => ({
  pullPreference: async (_u: string, key: string) => stored.get(key) ?? null,
  savePreference: (u: string, key: string, value: unknown) => save(u, key, value),
}));
const invoke = vi.fn();
vi.mock("@shared/platform", () => ({ isTauri: () => true, invoke: (c: string, a?: unknown) => invoke(c, a) }));
const get = vi.fn();
const patch = vi.fn();
vi.mock("@modules/sync-offline", () => ({
  serverApi: { get: (p: string) => get(p), patch: (p: string, b: unknown) => patch(p, b) },
}));

const { isAppearance, pullSynced, syncProfileNames } = await import("./preferenceSync");

beforeEach(() => {
  stored.clear();
  vi.clearAllMocks();
});

describe("pullSynced", () => {
  it("seeds the account with this device's value when it has none", async () => {
    expect(await pullSynced("u", "ui.language", "es")).toBeNull();
    expect(save).toHaveBeenCalledWith("u", "ui.language", "es");
  });

  it("returns the account's value when it differs, nothing when it is the same", async () => {
    stored.set("ui.language", { value: "en", updatedAt: "t", pending: false });
    expect(await pullSynced("u", "ui.language", "es")).toBe("en");
    expect(await pullSynced("u", "ui.language", "en")).toBeNull();
  });

  it("ignores a value it does not understand", async () => {
    stored.set("ui.theme", { value: "purple", updatedAt: "t", pending: false });
    expect(await pullSynced("u", "ui.theme", "light")).toBeNull();
  });

  it("an appearance never carries an image of the device's own", () => {
    expect(isAppearance({ cardShadow: true, backgroundOpacity: 40, background: "default" })).toBe(true);
    expect(isAppearance({ cardShadow: true, backgroundOpacity: 40, background: "data:image/png;base64,AAA" })).toBe(false);
  });
});

describe("syncProfileNames", () => {
  const local = {
    id: "u",
    workspaceId: "w",
    displayName: "Lio",
    firstName: "Liomar",
    lastName: "R",
    role: "test_manager",
    createdBy: "u",
    updatedBy: "u",
    createdAt: "2026-11-01 10:00:00",
    updatedAt: "2026-11-17 10:00:00",
    revision: 2,
  };

  it("sends the desktop's names when they are newer", async () => {
    invoke.mockResolvedValueOnce(local);
    get.mockResolvedValue({ displayName: "Old", firstName: "Liomar", lastName: "R", updatedAt: "2026-11-10T00:00:00Z" });
    expect(await syncProfileNames()).toBe("sent");
    expect(patch).toHaveBeenCalledWith("/auth/me", { displayName: "Lio", firstName: "Liomar", lastName: "R" });
  });

  it("keeps the account's names here when they are newer", async () => {
    invoke.mockResolvedValueOnce(local);
    get.mockResolvedValue({ displayName: "Liomar R.", firstName: "Liomar", lastName: "R", updatedAt: "2026-11-17T12:00:00Z" });
    expect(await syncProfileNames()).toBe("received");
    expect(invoke).toHaveBeenLastCalledWith("profile_upsert", {
      input: { displayName: "Liomar R.", firstName: "Liomar", lastName: "R", role: "test_manager" },
    });
  });

  it("does nothing when they match, or offline", async () => {
    invoke.mockResolvedValueOnce(local);
    get.mockResolvedValue({ displayName: "Lio", firstName: "Liomar", lastName: "R" });
    expect(await syncProfileNames()).toBe("same");
    invoke.mockResolvedValueOnce(local);
    get.mockRejectedValue(new Error("offline"));
    expect(await syncProfileNames()).toBe("skipped");
    expect(patch).not.toHaveBeenCalled();
  });
});
