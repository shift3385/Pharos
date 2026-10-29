// BASE-10: what an older web version left in localStorage is pushed once,
// whatever the server does not take goes to a file, and the old store is
// removed. A network failure removes nothing.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { drainLegacyWebData } from "./legacyWebData";

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

beforeEach(() => {
  localStorage.setItem("pharos.session", JSON.stringify({ accessToken: "tok", refreshToken: "r", user: { id: "u1" } }));
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  saveFile.mockClear();
});

describe("drainLegacyWebData", () => {
  it("does nothing when the browser holds no old store", async () => {
    expect(await drainLegacyWebData()).toEqual({ pushed: 0, leftovers: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pushes the outbox, saves what the server refused, and clears the old store", async () => {
    localStorage.setItem("pharos.testCases", "[]");
    localStorage.setItem("pharos.projects.lastAccess.u1", "{}"); // a preference, kept
    localStorage.setItem("pharos.sync.outbox:u1", JSON.stringify([delta("a"), delta("b"), delta("c", { refused: true })]));
    localStorage.setItem("pharos.sync.outbox:u2", JSON.stringify([delta("z")])); // another account's: kept
    localStorage.setItem("pharos.plannerAttachments", JSON.stringify([{ id: "att" }]));
    localStorage.setItem("pharos.templates", JSON.stringify([{ id: "builtin", isBuiltin: true }, { id: "mine" }]));
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ conflicts: [{ entity: "test_case", entityId: "b" }], keyConflicts: [] }), { status: 200 }),
    );

    expect(await drainLegacyWebData()).toEqual({ pushed: 1, leftovers: 4 });
    const pushed = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(pushed.deltas.map((d: { entityId: string }) => d.entityId)).toEqual(["a", "b"]);
    const [name, json] = saveFile.mock.calls[0] as unknown as [string, string];
    expect(name).toMatch(/^pharos-web-unsent-\d{4}-\d{2}-\d{2}\.json$/);
    const file = JSON.parse(json);
    expect(file.refusedChanges.map((d: { entityId: string }) => d.entityId).sort()).toEqual(["b", "c"]);
    expect(file.attachments).toEqual([{ id: "att" }]);
    expect(file.templates).toEqual([{ id: "mine" }]);
    expect(Object.keys(localStorage).sort()).toEqual(["pharos.projects.lastAccess.u1", "pharos.session", "pharos.sync.outbox:u2"]);
  });

  it("a network failure keeps everything for the next sync", async () => {
    localStorage.setItem("pharos.sync.outbox:u1", JSON.stringify([delta("a")]));
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(drainLegacyWebData()).rejects.toThrow();
    expect(localStorage.getItem("pharos.sync.outbox:u1")).not.toBeNull();
    expect(saveFile).not.toHaveBeenCalled();
  });
});
