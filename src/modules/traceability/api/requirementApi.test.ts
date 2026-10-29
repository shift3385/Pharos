import { beforeEach, describe, expect, it } from "vitest";
import { requirementApi } from "./requirementApi";

const USER = "user-1";
const base = { projectId: "p1", userId: USER };

describe("requirementApi (browser fallback)", () => {
  beforeEach(() => localStorage.clear());

  it("numbers keys per project starting at REQ-001", async () => {
    const a = await requirementApi.create({ ...base, title: "A" });
    const b = await requirementApi.create({ ...base, title: "B" });
    const c = await requirementApi.create({ ...base, projectId: "p2", title: "C" });
    expect([a?.requirementKey, b?.requirementKey, c?.requirementKey]).toEqual([
      "REQ-001",
      "REQ-002",
      "REQ-001",
    ]);
  });

  it("never reuses the key of a deleted requirement", async () => {
    const a = await requirementApi.create({ ...base, title: "A" });
    await requirementApi.remove(a!.id, USER);
    expect(await requirementApi.list("p1", USER)).toEqual([]);
    const b = await requirementApi.create({ ...base, title: "B" });
    expect(b?.requirementKey).toBe("REQ-002");
  });

  it("rejects duplicate and tag-unsafe keys", async () => {
    await requirementApi.create({ ...base, requirementKey: "US-12", title: "A" });
    await expect(
      requirementApi.create({ ...base, requirementKey: "US-12", title: "B" }),
    ).rejects.toThrow(/duplicate/);
    await expect(
      requirementApi.create({ ...base, requirementKey: "REQ 1", title: "C" }),
    ).rejects.toThrow(/invalid/);
  });

  it("keeps the key immutable and bumps the revision on update", async () => {
    const a = await requirementApi.create({ ...base, title: "A" });
    const u = await requirementApi.update(a!.id, {
      ...base,
      requirementKey: "REQ-999",
      title: "A v2",
      priority: "high",
    });
    expect(u).toMatchObject({ requirementKey: "REQ-001", title: "A v2", priority: "high", revision: 2 });
  });

  it("imports by upserting on the key", async () => {
    await requirementApi.create({ ...base, requirementKey: "REQ-001", title: "Old" });
    const summary = await requirementApi.importRows("p1", USER, [
      { requirementKey: "REQ-001", title: "New" },
      { title: "Fresh" },
      { title: "  " },
    ]);
    expect(summary).toEqual({ created: 1, updated: 1 });
    const list = await requirementApi.list("p1", USER);
    expect(list.map((r) => [r.requirementKey, r.title])).toEqual([
      ["REQ-001", "New"],
      ["REQ-002", "Fresh"],
    ]);
  });
});
