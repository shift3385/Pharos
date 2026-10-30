import { describe, expect, it, vi } from "vitest";
import { loadHome } from "./loadHome";

// The Home reads only public, read-only APIs; each one is mocked here.
vi.mock("@modules/projects", () => ({
  projectApi: {
    list: vi.fn(async () => [
      {
        id: "old",
        name: "Migración ERP",
        caseIdPrefix: "ERP_",
        caseIdDigits: 3,
        updatedAt: "2026-10-01T00:00:00Z",
        revision: 1,
      },
      {
        id: "new",
        name: "Portal Clientes",
        caseIdPrefix: "PCL-",
        caseIdDigits: 4,
        updatedAt: "2026-10-28T00:00:00Z",
        revision: 3,
      },
    ]),
  },
}));
vi.mock("@modules/test-cases", () => ({
  projectLiveCases: vi.fn(async (projectId: string) =>
    projectId === "new"
      ? [
          {
            id: "c1",
            scenarioId: "PCL-0001",
            title: "Login",
            status: "approved",
            priority: "critical",
            gherkinLevel: "basic",
            updatedAt: "",
            revision: 1,
          },
        ]
      : [],
  ),
}));
vi.mock("@modules/test-plan", () => ({
  projectPlanClosure: vi.fn(async (projectId: string) =>
    projectId === "new"
      ? {
          closeDate: "2026-11-07",
          criteria: [{ criterion: "% ejecutado", metric: "≥ 95 %" }],
        }
      : null,
  ),
}));
vi.mock("@modules/planner", () => ({
  projectDefects: vi.fn(async (projectId: string) =>
    projectId === "new"
      ? [
          { id: "d1", kind: "defect", status: "backlog", priority: "critical" },
          { id: "d2", kind: "defect", status: "in_review", priority: "high" },
          { id: "d3", kind: "defect", status: "done", priority: "critical" },
        ]
      : [],
  ),
}));

describe("loadHome (RED-V1)", () => {
  it("builds one Home project per project, most recently updated first", async () => {
    const [portal, erp] = await loadHome("u1");
    expect([portal.id, erp.id]).toEqual(["new", "old"]);
    expect(portal.key).toBe("PCL");
    expect(erp.key).toBe("ERP");
    expect(portal.cases).toEqual([
      {
        id: "c1",
        scenarioId: "PCL-0001",
        title: "Login",
        priority: "critical",
      },
    ]);
  });

  it("counts the open defects (not done) and the critical ones among them", async () => {
    const [portal, erp] = await loadHome("u1");
    expect(portal.openDefects).toBe(2);
    expect(portal.criticalDefects).toBe(1);
    expect(erp.openDefects).toBe(0);
  });

  it("takes the closing date and criteria from the plan, and marks a project without one", async () => {
    const [portal, erp] = await loadHome("u1");
    expect(portal).toMatchObject({ hasPlan: true, closeDate: "2026-11-07" });
    expect(portal.criteria).toHaveLength(1);
    expect(erp).toMatchObject({
      hasPlan: false,
      closeDate: null,
      criteria: [],
    });
  });
});
