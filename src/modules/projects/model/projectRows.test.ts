import { describe, expect, it, vi } from "vitest";
import { projectRows } from "./projectRows";

vi.mock("@modules/test-plan", () => ({
  projectPlanStatus: async () => null,
  projectPlanClosure: async () => null,
}));
vi.mock("@modules/test-cases", () => ({ projectCaseCount: async () => 0 }));
vi.mock("@modules/traceability", () => ({ projectCoverage: async () => null }));
vi.mock("../api/projectApi", () => ({
  projectApi: {
    list: async () => [
      { id: "a", name: "A", caseIdPrefix: "A-", caseIdDigits: 3, updatedAt: "2026-10-30 18:02:00", revision: 1 },
      { id: "b", name: "B", caseIdPrefix: "B-", caseIdDigits: 3, updatedAt: "not a date", revision: 1 },
    ],
  },
}));

describe("projectRows", () => {
  it("reads stored UTC times and survives one that is not a date", async () => {
    const rows = await projectRows("u1");
    expect(rows.map((r) => r.updatedAt)).toEqual(["2026-10-30T18:02:00.000Z", "not a date"]);
  });
});
