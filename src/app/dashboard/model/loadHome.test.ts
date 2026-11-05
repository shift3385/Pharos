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
// Cases and defects are counted by the metrics read (RED-W6): the Home must
// not read them per project (spies that must stay uncalled).
const perProject = vi.hoisted(() => ({ cases: vi.fn(), defects: vi.fn() }));
vi.mock("@modules/test-cases", () => ({ projectLiveCases: perProject.cases }));
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
vi.mock("@modules/defects", () => ({ projectDefects: perProject.defects }));

describe("loadHome (RED-V1)", () => {
  it("builds one Home project per project, most recently updated first", async () => {
    const [portal, erp] = await loadHome("u1");
    expect([portal.id, erp.id]).toEqual(["new", "old"]);
    expect(portal.key).toBe("PCL");
    expect(erp.key).toBe("ERP");
    expect(Object.keys(portal).sort()).toEqual(["closeDate", "criteria", "hasPlan", "id", "key", "name"]);
  });

  it("reads one thing per project, its plan: no cases, no defects (the metrics count them)", async () => {
    await loadHome("u1");
    expect(perProject.cases).not.toHaveBeenCalled();
    expect(perProject.defects).not.toHaveBeenCalled();
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
