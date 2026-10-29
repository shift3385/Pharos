// BASE-10: what an older web version left in localStorage is pushed once;
// whatever the server does not take is set aside for its account until the
// user downloads it and says so; each account takes only its own share of the
// browser-only data. A network failure changes nothing.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  discardLegacyLeftovers,
  downloadLegacyLeftovers,
  drainLegacyWebData,
  legacyLeftovers,
  unsentKey,
} from "./legacyWebData";

const saveFile = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@shared/export/saveFile", () => ({ saveFile }));

const fetchMock = vi.fn();
const delta = (entityId: string, extra: object = {}) => ({
  entity: "test_case",
  entityId,
  op: "upsert",
  payload: { id: entityId },
  revision: 1,
  author: "u1",
  hlc: "000000000000001-00000-web",
  ...extra,
});
const set = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
const accepted = (conflicts: { entity: string; entityId: string }[] = []) =>
  new Response(JSON.stringify({ conflicts, keyConflicts: [] }), { status: 200 });

beforeEach(() => {
  set("pharos.session", { accessToken: "tok", refreshToken: "r", user: { id: "u1" } });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  saveFile.mockClear();
});

describe("drainLegacyWebData", () => {
  it("does nothing when the browser holds no old store", async () => {
    expect(await drainLegacyWebData()).toEqual({ pushed: 0, leftovers: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pushes the outbox, sets aside what the server refused, and clears the old store", async () => {
    set("pharos.testCases", []);
    localStorage.setItem("pharos.sync.cacheOwner", "u1"); // a raw id, as webSync wrote it
    set("pharos.projects.lastAccess.u1", {}); // a preference, kept
    set("pharos.sync.outbox:u1", [delta("a"), delta("b"), delta("c", { refused: true })]);
    set("pharos.sync.outbox:u2", [delta("z")]); // another account's: kept
    set("pharos.plannerAttachments", [{ id: "att", cardId: "k1" }]);
    set("pharos.templates", [{ id: "builtin", isBuiltin: true }, { id: "mine" }]);
    set("pharos.testCaseRevisions", [{ id: "rev" }]);
    fetchMock.mockResolvedValue(accepted([{ entity: "test_case", entityId: "b" }]));

    expect(await drainLegacyWebData()).toEqual({ pushed: 1, leftovers: 5 });
    const pushed = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(pushed.deltas.map((d: { entityId: string }) => d.entityId)).toEqual(["a", "b"]);
    // Nothing is downloaded by itself: it waits for the user.
    expect(saveFile).not.toHaveBeenCalled();
    const left = await legacyLeftovers();
    expect(left?.refusedChanges.map((d) => d.entityId).sort()).toEqual(["b", "c"]);
    expect(left).toMatchObject({ attachments: [{ id: "att" }], templates: [{ id: "mine" }], revisions: [{ id: "rev" }] });
    expect(Object.keys(localStorage).sort()).toEqual([
      unsentKey("u1"),
      "pharos.projects.lastAccess.u1",
      "pharos.session",
      "pharos.sync.outbox:u2",
    ]);
    // A second sync finds nothing new and keeps what waits.
    expect(await drainLegacyWebData()).toEqual({ pushed: 0, leftovers: 5 });
  });

  it("takes only this account's share of the browser-only data", async () => {
    localStorage.setItem("pharos.sync.cacheOwner", "u2");
    set("pharos.sync.outbox:u1", [delta("k1", { entity: "planner_card" })]);
    set("pharos.plannerAttachments", [
      { id: "mine", cardId: "k1" },
      { id: "theirs", cardId: "k9" },
    ]);
    set("pharos.templates", [{ id: "their-template" }]);
    fetchMock.mockResolvedValue(accepted());

    await drainLegacyWebData();
    expect((await legacyLeftovers())?.attachments).toEqual([{ id: "mine", cardId: "k1" }]);
    expect(JSON.parse(localStorage.getItem("pharos.plannerAttachments")!)).toEqual([{ id: "theirs", cardId: "k9" }]);
    expect(JSON.parse(localStorage.getItem("pharos.templates")!)).toEqual([{ id: "their-template" }]);
    expect(localStorage.getItem("pharos.sync.cacheOwner")).toBe("u2");

    // The owner signs in: it takes the rest, and the shared keys go.
    set("pharos.session", { accessToken: "tok", refreshToken: "r", user: { id: "u2" } });
    await drainLegacyWebData();
    expect((await legacyLeftovers())?.templates).toEqual([{ id: "their-template" }]);
    for (const key of ["pharos.plannerAttachments", "pharos.templates", "pharos.sync.cacheOwner"]) {
      expect(localStorage.getItem(key), key).toBeNull();
    }
  });

  it("keeps the leftovers after a download until the user says so", async () => {
    set(unsentKey("u1"), { refusedChanges: [delta("a")], conflicts: [], attachments: [], templates: [], revisions: [] });
    await downloadLegacyLeftovers();
    const [name, json] = saveFile.mock.calls[0] as unknown as [string, string];
    expect(name).toMatch(/^pharos-web-unsent-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(json).refusedChanges).toHaveLength(1);
    expect((await legacyLeftovers())?.downloadedAt).toEqual(expect.any(String));
    await discardLegacyLeftovers();
    expect(await legacyLeftovers()).toBeNull();
  });

  it("a network failure keeps everything for the next sync", async () => {
    set("pharos.sync.outbox:u1", [delta("a")]);
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(drainLegacyWebData()).rejects.toThrow();
    expect(localStorage.getItem("pharos.sync.outbox:u1")).not.toBeNull();
    expect(localStorage.getItem(unsentKey("u1"))).toBeNull();
  });
});
