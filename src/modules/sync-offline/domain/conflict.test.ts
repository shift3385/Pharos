import { describe, expect, it } from "vitest";
import { conflictTitle, diffConflict, type SyncConflict } from "./conflict";

const conflict = (
  local: Record<string, unknown> | null,
  remote: Record<string, unknown> | null,
): SyncConflict => ({
  id: "k1",
  entity: "test_case",
  entityId: "c1",
  baseRevision: 3,
  local: { payload: local, revision: 4, deleted: local === null, hlc: "l" },
  remote: { payload: remote, revision: 4, deleted: remote === null, hlc: "r" },
  detectedAt: "2026-10-26 10:00:00",
});

describe("diffConflict", () => {
  it("lists both versions field by field and flags what differs", () => {
    const c = conflict(
      {
        id: "c1",
        title: "Login (desktop)",
        status: "draft",
        revision: 4,
        updatedAt: "x",
        data: { steps: ["a"], notes: "n" },
      },
      {
        id: "c1",
        title: "Login (web)",
        status: "draft",
        revision: 4,
        updatedAt: "y",
        data: { steps: ["a", "b"], notes: "n" },
      },
    );
    const diff = diffConflict(c);
    // Bookkeeping fields are hidden; `data` is opened one level.
    expect(diff.map((d) => d.key)).toEqual([
      "title",
      "status",
      "data.steps",
      "data.notes",
    ]);
    expect(diff.filter((d) => d.changed).map((d) => d.key)).toEqual([
      "title",
      "data.steps",
    ]);
    expect(diff[0]).toMatchObject({
      local: "Login (desktop)",
      remote: "Login (web)",
    });
  });

  it("shows every field as changed when one side deleted the entity", () => {
    const diff = diffConflict(
      conflict(null, { title: "Login", status: "ready" }),
    );
    expect(diff.every((d) => d.changed && d.local === undefined)).toBe(true);
  });

  it("includes fields present on only one side", () => {
    const diff = diffConflict(
      conflict({ title: "A" }, { title: "A", priority: "high" }),
    );
    expect(diff).toEqual([
      { key: "title", local: "A", remote: "A", changed: false },
      { key: "priority", local: undefined, remote: "high", changed: true },
    ]);
  });
});

describe("conflictTitle", () => {
  it("uses the title, then the name, then the id", () => {
    expect(conflictTitle(conflict({ title: "Plan" }, null))).toBe("Plan");
    expect(conflictTitle(conflict(null, { name: "Checkout" }))).toBe(
      "Checkout",
    );
    expect(conflictTitle(conflict({}, {}))).toBe("c1");
  });
});
