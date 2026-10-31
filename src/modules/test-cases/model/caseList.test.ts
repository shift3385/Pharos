import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  customFilterValue,
  hasMenuFilters,
  filterCases,
  sortCases,
  statusCounts,
  type ListedCase,
} from "./caseList";

const c = (scenarioId: string, over: Partial<ListedCase> = {}): ListedCase => ({
  id: scenarioId.toLowerCase(),
  scenarioId,
  title: `Caso ${scenarioId}`,
  status: "draft",
  priority: "medium",
  gherkinLevel: "basic",
  caseType: null,
  automationStatus: null,
  custom: {},
  updatedAt: "2026-10-01T10:00:00Z",
  revision: 1,
  requirementKeys: [],
  ...over,
});

const CASES = [
  c("PCL-10", { title: "Pago rechazado", status: "approved", priority: "high", requirementKeys: ["REQ-031"] }),
  c("PCL-2", { title: "Reembolso", status: "reviewed", priority: "critical", gherkinLevel: "outline" }),
  c("PCL-1", { title: "Descarga de factura", status: "approved", priority: "low" }),
  c("PCL-3", { title: "Cupón caducado", status: "obsolete" }),
];

describe("case list model", () => {
  it("searches the ID, the title (without accents) and the linked requirements", () => {
    const ids = (q: string) => filterCases(CASES, { ...EMPTY_FILTERS, query: q }).map((x) => x.scenarioId);
    expect(ids("req-031")).toEqual(["PCL-10"]);
    expect(ids("cupon")).toEqual(["PCL-3"]);
    expect(ids("pcl-2")).toEqual(["PCL-2"]);
  });

  it("combines the state, priority and level filters", () => {
    const f = { ...EMPTY_FILTERS, status: "approved" as const, priorities: new Set(["high", "low"]) };
    expect(filterCases(CASES, f).map((x) => x.scenarioId)).toEqual(["PCL-10", "PCL-1"]);
    expect(filterCases(CASES, { ...EMPTY_FILTERS, levels: new Set(["outline" as const]) })).toHaveLength(1);
  });

  it("counts each state with the other filters on, ignoring the chosen state", () => {
    const counts = statusCounts(CASES, { ...EMPTY_FILTERS, status: "draft", priorities: new Set(["high", "low", "medium"]) });
    expect(counts).toEqual({ all: 3, draft: 0, reviewed: 0, approved: 2, obsolete: 1 });
  });

  it("sorts by ID in natural order and by priority keeping ID ties", () => {
    expect(sortCases(CASES, { id: "id", dir: "asc" }).map((x) => x.scenarioId)).toEqual([
      "PCL-1",
      "PCL-2",
      "PCL-3",
      "PCL-10",
    ]);
    expect(sortCases(CASES, { id: "priority", dir: "asc" }).map((x) => x.scenarioId)).toEqual([
      "PCL-2",
      "PCL-10",
      "PCL-3",
      "PCL-1",
    ]);
    expect(sortCases(CASES, { id: "id", dir: "desc" })[0].scenarioId).toBe("PCL-10");
  });
});

describe("type, automation and custom field filters (FLD-01)", () => {
  const list = [
    c("A-1", { caseType: null, automationStatus: null }),
    c("A-2", { caseType: "checklist", automationStatus: "automated" }),
    c("A-3", { custom: { browser: ["OPT1", "OPT2"], signed: true } }),
    c("A-4", { custom: { browser: ["OPT2"], signed: false } }),
  ];
  const ids = (f: Partial<typeof EMPTY_FILTERS>) =>
    filterCases(list, { ...EMPTY_FILTERS, ...f }).map((x) => x.scenarioId);

  it("a case that never set them counts as standard and manual", () => {
    expect(ids({ caseTypes: new Set(["standard"]) })).toEqual([
      "A-1",
      "A-3",
      "A-4",
    ]);
    expect(ids({ automation: new Set(["manual"]) })).toEqual([
      "A-1",
      "A-3",
      "A-4",
    ]);
    expect(ids({ automation: new Set(["automated"]) })).toEqual(["A-2"]);
  });

  it("any value within a field, every field across them", () => {
    const v = customFilterValue;
    expect(ids({ custom: new Set([v("browser", "OPT1")]) })).toEqual(["A-3"]);
    expect(
      ids({ custom: new Set([v("browser", "OPT1"), v("browser", "OPT2")]) }),
    ).toEqual(["A-3", "A-4"]);
    expect(
      ids({ custom: new Set([v("browser", "OPT2"), v("signed", "false")]) }),
    ).toEqual(["A-4"]);
    expect(
      hasMenuFilters({
        ...EMPTY_FILTERS,
        custom: new Set([v("signed", "true")]),
      }),
    ).toBe(true);
  });
});
