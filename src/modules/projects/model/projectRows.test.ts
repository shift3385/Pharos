import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectRows } from "./projectRows";

const plan = vi.fn();
const facts = vi.fn();
vi.mock("@modules/test-plan", () => ({ projectPlanOverview: (...a: unknown[]) => plan(...a) }));
vi.mock("@modules/traceability", () => ({ projectTraceFacts: (...a: unknown[]) => facts(...a) }));
const summary = vi.fn();
vi.mock("@modules/runs", () => ({ executionApi: { summary: (...a: unknown[]) => summary(...a) } }));
vi.mock("../api/projectApi", () => ({
  projectApi: {
    list: async () => [
      { id: "a", name: "A", caseIdPrefix: "A-", caseIdDigits: 3, updatedAt: "2026-10-30 18:02:00", revision: 1 },
      { id: "b", name: "B", caseIdPrefix: "B-", caseIdDigits: 3, updatedAt: "not a date", revision: 1 },
    ],
  },
}));

describe("projectRows", () => {
  beforeEach(() => {
    plan.mockReset().mockResolvedValue(null);
    facts.mockReset().mockResolvedValue({ cases: 0, coverage: null });
    summary.mockReset().mockResolvedValue(null);
  });

  it("reads each project's execution progress; a failed read leaves it empty (NC-021)", async () => {
    summary.mockImplementation(async ({ projectId }: { projectId: string }) => {
      if (projectId === "b") throw new Error("down");
      return { progress: { executed: 2, total: 5 } };
    });
    const rows = await projectRows("u1");
    expect(rows.map((r) => r.execution)).toEqual([{ executed: 2, total: 5 }, null]);
  });

  it("reads stored UTC times and survives one that is not a date", async () => {
    const rows = await projectRows("u1");
    expect(rows.map((r) => r.updatedAt)).toEqual(["2026-10-30T18:02:00.000Z", "not a date"]);
  });

  it("fills each row from one read of its plan and one of its trace facts (FIX-20)", async () => {
    plan.mockImplementation(async (id: string) =>
      id === "a" ? { status: "approved", closeDate: "2026-12-15" } : null,
    );
    facts.mockImplementation(async (id: string) =>
      id === "a" ? { cases: 3, coverage: 0.5 } : { cases: 1, coverage: null },
    );

    const rows = await projectRows("u1");

    expect(rows.map((r) => [r.id, r.planStatus, r.closeDate, r.cases, r.coverage])).toEqual([
      ["a", "approved", "2026-12-15", 3, 0.5],
      ["b", null, null, 1, null],
    ]);
    expect(plan).toHaveBeenCalledTimes(2);
    expect(facts).toHaveBeenCalledTimes(2);
  });
});
