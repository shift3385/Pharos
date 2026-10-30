import { beforeEach, describe, expect, it, vi } from "vitest";
import { lastAccessMap, recordProjectAccess } from "./lastAccess";
import { progressPercent, projectOverview } from "./overview";

vi.mock("@modules/test-plan", () => ({
  projectPlanStatus: async (id: string) => (id === "a" ? "approved" : null),
}));
vi.mock("@modules/test-cases", () => ({
  projectCaseProgress: async (id: string) =>
    id === "a" ? { approved: 1, total: 3 } : { approved: 0, total: 0 },
}));
vi.mock("../api/projectApi", () => ({
  projectApi: {
    list: async () => [
      { id: "a", name: "Alpha", updatedAt: "2026-10-01T00:00:00.000Z" },
      { id: "b", name: "Beta", updatedAt: "2026-10-25T00:00:00.000Z" },
      { id: "c", name: "Gamma", updatedAt: "2026-10-10T00:00:00.000Z" },
    ],
  },
}));

describe("project overview for the Home (UX-08)", () => {
  beforeEach(() => localStorage.clear());

  it("records last access per user only", () => {
    recordProjectAccess("u1", "a", new Date("2026-10-28T00:00:00.000Z"));
    recordProjectAccess("", "a");
    expect(lastAccessMap("u1")).toEqual({ a: "2026-10-28T00:00:00.000Z" });
    expect(lastAccessMap("u2")).toEqual({});
  });

  it("survives a corrupt store", () => {
    localStorage.setItem("pharos.projects.lastAccess.u1", "not json");
    expect(lastAccessMap("u1")).toEqual({});
    recordProjectAccess("u1", "b", new Date("2026-10-29T00:00:00.000Z"));
    expect(lastAccessMap("u1")).toEqual({ b: "2026-10-29T00:00:00.000Z" });
  });

  it("orders by last access, else last update, with status and progress", async () => {
    recordProjectAccess("u1", "a", new Date("2026-10-28T00:00:00.000Z"));
    const rows = await projectOverview("u1");
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(rows[0]).toMatchObject({
      planStatus: "approved",
      approved: 1,
      total: 3,
    });
    expect(rows[1]).toMatchObject({
      lastAccess: null,
      planStatus: null,
      total: 0,
    });
  });

  it("computes progress", () => {
    expect(progressPercent({ approved: 1, total: 3 })).toBe(33);
    expect(progressPercent({ approved: 0, total: 0 })).toBe(0);
  });
});
