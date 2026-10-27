import { describe, expect, it } from "vitest";
import { splitPushed, syncStatus, type PendingDelta } from "./syncApi";

describe("syncStatus", () => {
  it("is offline whenever there is no connection, regardless of pending", () => {
    expect(syncStatus(false, 0)).toBe("offline");
    expect(syncStatus(false, 5)).toBe("offline");
    expect(syncStatus(false, 5, 2)).toBe("offline");
  });
  it("is pending when online with unsynced changes", () => {
    expect(syncStatus(true, 3)).toBe("pending");
  });
  it("is synced when online with nothing pending", () => {
    expect(syncStatus(true, 0)).toBe("synced");
  });
  it("shows conflicts first: they need the user", () => {
    expect(syncStatus(true, 3, 1)).toBe("conflicts");
    expect(syncStatus(true, 0, 1)).toBe("conflicts");
  });
});

describe("splitPushed", () => {
  const d = (entity: string, entityId: string): PendingDelta => ({
    entity,
    entityId,
    op: "upsert",
    payload: {},
    revision: 2,
    author: "A",
    hlc: "h",
    baseRevision: 1,
    baseHlc: "",
    opIds: [`${entityId}-op`],
  });

  it("only the deltas the server did not reject are marked synced", () => {
    const deltas = [
      d("test_case", "c1"),
      d("test_case", "c2"),
      d("project", "c1"),
    ];
    const { accepted, rejected } = splitPushed(deltas, [
      { entity: "test_case", entityId: "c1" },
    ]);
    expect(accepted.map((x) => `${x.entity}:${x.entityId}`)).toEqual([
      "test_case:c2",
      "project:c1",
    ]);
    expect(rejected.map((x) => x.entityId)).toEqual(["c1"]);
  });
});
