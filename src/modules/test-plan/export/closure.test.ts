import { describe, expect, it, vi } from "vitest";
import { projectPlanClosure } from "./batch";

// Home exit criteria (RED-V1): closing date from the schedule and the plan's
// closure criteria. Kept apart from batch.test.ts, which stubs the exporters.
vi.mock("../api/testPlanApi", () => ({
  testPlanApi: {
    byProject: async (projectId: string) =>
      projectId === "none"
        ? null
        : projectId === "empty"
          ? { data: {} }
          : {
              data: {
                sprints: [
                  { name: "S1", start: "2026-11-03", end: "2026-11-14" },
                  { name: "S2", start: "2026-11-17", end: "2026-11-28" },
                ],
                milestones: [{ name: "Go-live", date: "2026-11-21" }],
                closureCriteria: [
                  { criterion: "% de casos ejecutados", metric: "≥ 95 %" },
                  { criterion: "  ", metric: "" },
                ],
              },
            },
  },
}));

describe("plan closure for the Home (RED-V1)", () => {
  it("takes the latest sprint end or milestone and the filled criteria", async () => {
    expect(await projectPlanClosure("p1", "u1")).toEqual({
      closeDate: "2026-11-28",
      criteria: [{ criterion: "% de casos ejecutados", metric: "≥ 95 %" }],
    });
  });

  it("has no date without a schedule and nothing without a plan", async () => {
    expect(await projectPlanClosure("empty", "u1")).toEqual({ closeDate: null, criteria: [] });
    expect(await projectPlanClosure("none", "u1")).toBeNull();
  });
});
