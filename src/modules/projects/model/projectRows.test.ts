import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectRows } from "./projectRows";

const api = vi.hoisted(() => ({
  tauri: { value: false },
  list: vi.fn(),
  webOverview: vi.fn(),
  planStatus: vi.fn(),
  planClosure: vi.fn(),
  caseCount: vi.fn(),
  coverage: vi.fn(),
}));

vi.mock("@shared/platform", () => ({ isTauri: () => api.tauri.value }));
vi.mock("@modules/test-plan", () => ({
  planClosure: (data: { sprints?: { end: string }[] }) => ({ closeDate: data.sprints?.[0]?.end ?? null, criteria: [] }),
  projectPlanStatus: api.planStatus,
  projectPlanClosure: api.planClosure,
}));
vi.mock("@modules/test-cases", () => ({ projectCaseCount: api.caseCount }));
vi.mock("@modules/traceability", () => ({ projectCoverage: api.coverage }));
vi.mock("../api/projectApi", () => ({
  projectApi: { list: api.list, webOverview: api.webOverview },
}));

const summary = (id: string, updatedAt: string) => ({
  id,
  name: id.toUpperCase(),
  caseIdPrefix: `${id.toUpperCase()}-`,
  caseIdDigits: 3,
  updatedAt,
  revision: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.tauri.value = false;
});

describe("projectRows on the web", () => {
  it("builds every row from one read, with no read per project", async () => {
    api.webOverview.mockResolvedValue([
      {
        ...summary("a", "2026-10-30 18:02:00"),
        plan: { status: "approved", data: { sprints: [{ end: "2026-12-01" }] } },
        cases: 4,
        coverage: 0.5,
      },
      { ...summary("b", "not a date"), plan: null, cases: 0, coverage: null },
    ]);
    const rows = await projectRows("u1");
    expect(rows.map((r) => r.updatedAt)).toEqual(["2026-10-30T18:02:00.000Z", "not a date"]);
    expect(rows[0]).toMatchObject({ planStatus: "approved", closeDate: "2026-12-01", cases: 4, coverage: 0.5 });
    expect(rows[1]).toMatchObject({ planStatus: null, closeDate: null, cases: 0, coverage: null });
    expect(api.webOverview).toHaveBeenCalledTimes(1);
    for (const perProject of [api.list, api.planStatus, api.planClosure, api.caseCount, api.coverage]) {
      expect(perProject).not.toHaveBeenCalled();
    }
  });
});

describe("projectRows on the desktop", () => {
  it("keeps composing its local commands and never calls the server", async () => {
    api.tauri.value = true;
    api.list.mockResolvedValue([summary("a", "2026-10-30 18:02:00"), summary("b", "not a date")]);
    api.planStatus.mockResolvedValue("draft");
    api.planClosure.mockResolvedValue({ closeDate: "2026-11-07", criteria: [] });
    api.caseCount.mockResolvedValue(2);
    api.coverage.mockResolvedValue(null);
    const rows = await projectRows("u1");
    expect(rows.map((r) => r.updatedAt)).toEqual(["2026-10-30T18:02:00.000Z", "not a date"]);
    expect(rows[0]).toMatchObject({ planStatus: "draft", closeDate: "2026-11-07", cases: 2, coverage: null });
    expect(api.webOverview).not.toHaveBeenCalled();
  });
});
