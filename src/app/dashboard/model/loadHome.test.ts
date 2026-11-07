import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadHome } from "./loadHome";

const api = vi.hoisted(() => ({
  tauri: { value: false },
  list: vi.fn(),
  webOverview: vi.fn(),
  projectPlanClosure: vi.fn(),
  // Cases and defects are counted by the metrics read (RED-W6): the Home must
  // not read them per project (spies that must stay uncalled).
  cases: vi.fn(),
  defects: vi.fn(),
}));

vi.mock("@shared/platform", () => ({ isTauri: () => api.tauri.value }));
vi.mock("@modules/projects", () => ({
  projectApi: { list: api.list, webOverview: api.webOverview },
}));
vi.mock("@modules/test-cases", () => ({ projectLiveCases: api.cases }));
vi.mock("@modules/test-plan", () => ({
  // The rule itself is tested with `projectPlanClosure` (closure.test.ts).
  planClosure: (data: { milestones?: { date: string }[]; closureCriteria?: unknown[] }) => ({
    closeDate: data.milestones?.[0]?.date ?? null,
    criteria: data.closureCriteria ?? [],
  }),
  projectPlanClosure: api.projectPlanClosure,
}));
vi.mock("@modules/defects", () => ({ projectDefects: api.defects }));

const old = {
  id: "old",
  name: "Migración ERP",
  caseIdPrefix: "ERP_",
  caseIdDigits: 3,
  updatedAt: "2026-10-01T00:00:00Z",
  revision: 1,
};
const recent = {
  id: "new",
  name: "Portal Clientes",
  caseIdPrefix: "PCL-",
  caseIdDigits: 4,
  updatedAt: "2026-10-28T00:00:00Z",
  revision: 3,
};
const criterion = { criterion: "% ejecutado", metric: "≥ 95 %" };

beforeEach(() => {
  vi.clearAllMocks();
  api.tauri.value = false;
  // Old first, as the server sends them by name.
  api.webOverview.mockResolvedValue([
    { ...old, plan: null, cases: 3, coverage: null },
    {
      ...recent,
      plan: {
        status: "approved",
        data: { milestones: [{ name: "M", date: "2026-11-07" }], closureCriteria: [criterion] },
      },
      cases: 9,
      coverage: 0.5,
    },
  ]);
});

describe("loadHome on the web (FIX-17)", () => {
  it("builds one Home project per project, most recently updated first", async () => {
    const [portal, erp] = await loadHome("u1");
    expect([portal.id, erp.id]).toEqual(["new", "old"]);
    expect(portal.key).toBe("PCL");
    expect(erp.key).toBe("ERP");
    expect(Object.keys(portal).sort()).toEqual(["closeDate", "criteria", "hasPlan", "id", "key", "name"]);
  });

  it("makes one read: nothing per project, no cases, no defects (the metrics count them)", async () => {
    await loadHome("u1");
    expect(api.webOverview).toHaveBeenCalledTimes(1);
    for (const perProject of [api.list, api.projectPlanClosure, api.cases, api.defects]) {
      expect(perProject).not.toHaveBeenCalled();
    }
  });

  it("takes the closing date and criteria from the plan, and marks a project without one", async () => {
    const [portal, erp] = await loadHome("u1");
    expect(portal).toMatchObject({ hasPlan: true, closeDate: "2026-11-07", criteria: [criterion] });
    expect(erp).toMatchObject({ hasPlan: false, closeDate: null, criteria: [] });
  });
});

describe("loadHome on the desktop", () => {
  it("asks its local store project by project and never calls the server", async () => {
    api.tauri.value = true;
    api.list.mockResolvedValue([old, recent]);
    api.projectPlanClosure.mockImplementation(async (id: string) =>
      id === "new" ? { closeDate: "2026-11-07", criteria: [criterion] } : null,
    );
    const [portal, erp] = await loadHome("u1");
    expect([portal.id, erp.id]).toEqual(["new", "old"]);
    expect(portal).toMatchObject({ hasPlan: true, closeDate: "2026-11-07", criteria: [criterion] });
    expect(erp).toMatchObject({ hasPlan: false, closeDate: null, criteria: [] });
    expect(api.webOverview).not.toHaveBeenCalled();
  });
});
