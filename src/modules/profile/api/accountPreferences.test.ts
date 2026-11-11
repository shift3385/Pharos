import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullPreference, readLocalPreference, savePreference } from "./accountPreferences";

// The server's `/api/me/preferences/:key` (UX-27): one value per account,
// the newest change wins (server/src/modules/preferences).
type Row = { key: string; value: unknown; updatedAt: string | null };
const server = new Map<string, Row>();
let account = "ana";
let offline = false;

const get = vi.fn(async (path: string) => {
  if (offline) throw new Error("offline");
  const key = decodeURIComponent(path.split("/").pop()!);
  return server.get(`${account}:${key}`) ?? { key, value: null, updatedAt: null };
});
const put = vi.fn(async (path: string, _id: string, input: { value: unknown; updatedAt: string }) => {
  if (offline) throw new Error("offline");
  const key = decodeURIComponent(path.split("/").pop()!);
  const kept = server.get(`${account}:${key}`);
  if (!kept?.updatedAt || Date.parse(kept.updatedAt) < Date.parse(input.updatedAt))
    server.set(`${account}:${key}`, { key, value: input.value, updatedAt: input.updatedAt });
  return server.get(`${account}:${key}`);
});
vi.mock("@modules/sync-offline", () => ({
  serverApi: {
    get: (path: string) => get(path),
    put: (path: string, id: string, input: { value: unknown; updatedAt: string }) => put(path, id, input),
  },
}));

const as = async <T>(user: string, fn: () => Promise<T>) => {
  account = user;
  return fn();
};

describe("account preferences (UX-27)", () => {
  beforeEach(() => {
    server.clear();
    localStorage.clear();
    offline = false;
    get.mockClear();
    put.mockClear();
  });

  it("keeps one value per account: two users, two layouts", async () => {
    await as("ana", () => savePreference("ana", "home.board", { owner: "ana" }));
    await as("luis", () => savePreference("luis", "home.board", { owner: "luis" }));
    expect(readLocalPreference("ana", "home.board")?.value).toEqual({ owner: "ana" });
    expect(readLocalPreference("luis", "home.board")?.value).toEqual({ owner: "luis" });
    // On another device (nothing local), each account brings its own.
    localStorage.clear();
    expect((await as("luis", () => pullPreference("luis", "home.board")))?.value).toEqual({ owner: "luis" });
    expect((await as("ana", () => pullPreference("ana", "home.board")))?.value).toEqual({ owner: "ana" });
  });

  it("travels: a value saved on one device reaches the other on its next pull", async () => {
    await savePreference("ana", "home.board", { v: 1 }, new Date("2026-11-09T10:00:00Z"));
    expect(readLocalPreference("ana", "home.board")).toMatchObject({ pending: false });
    // The other device had an older copy.
    localStorage.setItem(
      "pharos.prefs.ana.home.board",
      JSON.stringify({ value: { v: 0 }, updatedAt: "2026-11-01T10:00:00Z", pending: false }),
    );
    expect((await pullPreference("ana", "home.board"))?.value).toEqual({ v: 1 });
  });

  it("offline, a change stays pending here and is sent on the next pull", async () => {
    offline = true;
    await savePreference("ana", "home.board", { v: 2 }, new Date("2026-11-09T12:00:00Z"));
    expect(readLocalPreference("ana", "home.board")).toMatchObject({ value: { v: 2 }, pending: true });
    // Offline the pull keeps this device's copy.
    expect((await pullPreference("ana", "home.board"))?.value).toEqual({ v: 2 });
    offline = false;
    server.set("ana:home.board", { key: "home.board", value: { v: 1 }, updatedAt: "2026-11-09T11:00:00Z" });
    expect((await pullPreference("ana", "home.board"))?.value).toEqual({ v: 2 });
    expect(server.get("ana:home.board")?.value).toEqual({ v: 2 });
    expect(readLocalPreference("ana", "home.board")?.pending).toBe(false);
  });

  it("a newer change from another device beats an older pending one", async () => {
    offline = true;
    await savePreference("ana", "home.board", { v: "old" }, new Date("2026-11-09T09:00:00Z"));
    offline = false;
    server.set("ana:home.board", { key: "home.board", value: { v: "new" }, updatedAt: "2026-11-09T10:00:00Z" });
    expect((await pullPreference("ana", "home.board"))?.value).toEqual({ v: "new" });
    expect(readLocalPreference("ana", "home.board")?.pending).toBe(false);
  });

  it("ignores answers that are not a preference and reads nothing without an account", async () => {
    get.mockResolvedValueOnce({ contractVersion: 1 } as never);
    expect(await pullPreference("ana", "home.board")).toBeNull();
    expect(await pullPreference("", "home.board")).toBeNull();
    expect(readLocalPreference("", "home.board")).toBeNull();
  });
});
