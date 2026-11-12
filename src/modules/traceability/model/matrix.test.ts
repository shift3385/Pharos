import { describe, expect, it } from "vitest";
import {
  buildMatrix,
  riskOfRecord,
  type MatrixCase,
  type MatrixDefect,
  type MatrixRequirement,
  type MatrixRow,
} from "./matrix";

const req = (requirementKey: string, title = requirementKey): MatrixRequirement => ({
  requirementKey,
  title,
  priority: "medium",
});
const tc = (id: string, scenarioId: string, keys: string[], status = "draft"): MatrixCase => ({
  id,
  scenarioId,
  title: `Case ${scenarioId}`,
  status,
  requirementKeys: keys,
});
const defect = (id: string, defectKey: string, testCaseIds: string[], status = "new"): MatrixDefect => ({
  id,
  defectKey,
  title: `Bug ${defectKey}`,
  status,
  testCaseIds,
});

describe("buildMatrix", () => {
  it("emits one row per requirement ↔ case link, sorted naturally", () => {
    const m = buildMatrix(
      [req("REQ-010"), req("REQ-002")],
      [tc("b", "TC-010", ["REQ-002"]), tc("a", "TC-002", ["REQ-002", "REQ-010"])],
      [],
    );
    expect(m.rows.map((r) => [r.requirementKey, r.scenarioId])).toEqual([
      ["REQ-002", "TC-002"],
      ["REQ-002", "TC-010"],
      ["REQ-010", "TC-002"],
    ]);
    expect(m.rows.every((r) => r.coverage === "covered" && r.executionStatus === "not_run")).toBe(true);
  });

  it("keeps a single empty row for an uncovered requirement", () => {
    const m = buildMatrix([req("REQ-001")], [], []);
    expect(m.rows).toEqual([
      {
        requirementKey: "REQ-001",
        requirementTitle: "REQ-001",
        priority: "medium",
        coverage: "not_covered",
        riskLevel: null,
        riskBand: "unassessed",
        defectKeys: [],
        defects: [],
        notes: [],
      },
    ]);
    expect(m.gaps.uncoveredRequirements).toEqual(["REQ-001"]);
  });

  it("does not count obsolete cases as coverage", () => {
    const m = buildMatrix([req("REQ-001")], [tc("a", "TC-001", ["REQ-001"], "obsolete")], []);
    expect(m.rows[0]).toMatchObject({ coverage: "not_covered", notes: ["obsoleteCase"] });
    expect(m.summary).toMatchObject({ totalRequirements: 1, covered: 0, uncovered: 1, coverageRatio: 0 });
  });

  it("brings defects through their case and flags open ones", () => {
    const m = buildMatrix(
      [req("REQ-001")],
      [tc("a", "TC-001", ["REQ-001"]), tc("b", "TC-002", ["REQ-001"])],
      [defect("d2", "DEF-002", ["a"], "closed"), defect("d1", "DEF-001", ["a"]), defect("d3", "DEF-003", ["b"], "rejected")],
    );
    expect(m.rows[0]).toMatchObject({ scenarioId: "TC-001", defectKeys: ["DEF-001", "DEF-002"], notes: ["openDefect"] });
    expect(m.rows[1]).toMatchObject({ scenarioId: "TC-002", defectKeys: ["DEF-003"], notes: [] });
  });

  it("counts a defect as open unless it is closed or rejected (ADR-0016)", () => {
    const open = (status: string) =>
      buildMatrix([req("REQ-001")], [tc("a", "TC-001", ["REQ-001"])], [defect("d", "DEF-001", ["a"], status)]).rows[0]
        .notes;
    for (const s of ["new", "open", "in_progress", "fixed", "retest", "deferred"]) expect(open(s), s).toEqual(["openDefect"]);
    for (const s of ["closed", "rejected"]) expect(open(s), s).toEqual([]);
  });

  it("counts distinct requirements in the summary, not rows", () => {
    const m = buildMatrix(
      [req("REQ-001"), req("REQ-002")],
      [tc("a", "TC-001", ["REQ-001"]), tc("b", "TC-002", ["REQ-001"])],
      [],
    );
    expect(m.rows).toHaveLength(3);
    expect(m.summary).toMatchObject({ totalRequirements: 2, covered: 1, uncovered: 1, coverageRatio: 0.5 });
    expect(m.summary.execution.not_run).toBe(2);
  });

  it("reports every kind of coverage gap", () => {
    const m = buildMatrix(
      [req("REQ-001")],
      [tc("a", "TC-001", ["REQ-001"]), tc("b", "TC-002", []), tc("c", "TC-003", ["REQ-404"])],
      [defect("d1", "DEF-001", []), defect("d2", "DEF-002", ["gone"]), defect("d3", "DEF-003", ["a"])],
    );
    expect(m.gaps.casesWithoutRequirement.map((c) => c.scenarioId)).toEqual(["TC-002", "TC-003"]);
    expect(m.gaps.unknownLinks).toEqual([{ caseId: "c", scenarioId: "TC-003", requirementKey: "REQ-404" }]);
    expect(m.gaps.defectsWithoutCase.map((d) => d.defectKey)).toEqual(["DEF-001", "DEF-002"]);
    expect(m.gaps.uncoveredRequirements).toEqual([]);
  });
});

// EJE-04 (step 10): the matrix with the execution derivation.
const last = (over: Partial<NonNullable<MatrixRow["last"]>> = {}): NonNullable<MatrixRow["last"]> => ({
  resultId: "r1",
  runId: "run1",
  runKey: "RUN-001",
  runTitle: "Manual",
  trigger: "manual",
  sourceTool: null,
  origin: "manual",
  at: "2026-11-01T10:00:00Z",
  status: "passed",
  configurationLabel: null,
  flaky: false,
  revisionId: "rev1",
  stale: false,
  ...over,
});

describe("buildMatrix with execution (EJE-04)", () => {
  const reqs = [req("REQ-001"), req("REQ-002"), req("REQ-003")];
  const cases = [
    tc("a", "TC-001", ["REQ-001"]),
    tc("b", "TC-002", ["REQ-002"]),
    tc("c", "TC-003", ["REQ-003"]),
  ];
  const execution = {
    cases: [
      { caseId: "a", status: "passed", last: last({ origin: "imported", runKey: "RUN-002", flaky: true }) },
      { caseId: "b", status: "retest", last: last({ status: "failed", stale: true }) },
    ],
    requirements: [
      { requirementKey: "REQ-001", riskLevel: 4, riskBand: "low" },
      { requirementKey: "REQ-002", riskLevel: 20, riskBand: "high" },
      { requirementKey: "REQ-003", riskLevel: null, riskBand: "unassessed" },
    ],
  };

  it("shows the latest final result of each case, with its notes", () => {
    const m = buildMatrix(reqs, cases, [], execution, "key");
    expect(m.rows.map((r) => [r.scenarioId, r.executionStatus, r.last?.runKey ?? null])).toEqual([
      ["TC-001", "passed", "RUN-002"],
      ["TC-002", "retest", "RUN-001"],
      ["TC-003", "not_run", null],
    ]);
    expect(m.rows[0].notes).toEqual(["flaky"]);
    expect(m.rows[1].notes).toEqual(["retest", "stale"]);
    expect(m.summary.execution).toMatchObject({ passed: 1, retest: 1, not_run: 1, failed: 0 });
  });

  it("orders requirements by risk (band, then level), unassessed last", () => {
    const m = buildMatrix(reqs, cases, [], execution);
    expect(m.rows.map((r) => [r.requirementKey, r.riskBand, r.riskLevel])).toEqual([
      ["REQ-002", "high", 20],
      ["REQ-001", "low", 4],
      ["REQ-003", "unassessed", null],
    ]);
  });

  it("lists open defects first, with their severity", () => {
    const d1 = { ...defect("d1", "DEF-001", ["a"], "closed"), severity: "minor" };
    const d2 = { ...defect("d2", "DEF-002", ["a"], "open"), severity: "critical" };
    const m = buildMatrix([req("REQ-001")], [cases[0]], [d1, d2], execution);
    expect(m.rows[0].defects).toEqual([
      { label: "DEF-002", severity: "critical", open: true },
      { label: "DEF-001", severity: "minor", open: false },
    ]);
  });
});

describe("risk order from the requirement records", () => {
  it("orders by the records' own risk before any execution summary arrives", () => {
    const m = buildMatrix(
      [
        { requirementKey: "REQ-001", title: "Low", priority: "low", riskLikelihood: 1, riskImpact: 2 },
        { requirementKey: "REQ-002", title: "High", priority: "low", riskLikelihood: 5, riskImpact: 5 },
        { requirementKey: "REQ-003", title: "None", priority: "low", riskLikelihood: null, riskImpact: null },
      ],
      [],
      [],
    );
    expect(m.rows.map((r) => [r.requirementKey, r.riskBand, r.riskLevel])).toEqual([
      ["REQ-002", "high", 25],
      ["REQ-001", "low", 2],
      ["REQ-003", "unassessed", null],
    ]);
  });
});

describe("risk bands per project (TRZ-04)", () => {
  it("reads the level with the project's bands, the defaults without them", () => {
    expect(riskOfRecord({ riskLikelihood: 3, riskImpact: 3 })).toEqual({ riskLevel: 9, riskBand: "medium" });
    expect(riskOfRecord({ riskLikelihood: 3, riskImpact: 3 }, { low: 9, medium: 11 })).toEqual({ riskLevel: 9, riskBand: "low" });
    expect(riskOfRecord({ riskLikelihood: 3, riskImpact: 4 }, { low: 9, medium: 11 })).toEqual({ riskLevel: 12, riskBand: "high" });
    expect(riskOfRecord({ riskLikelihood: null, riskImpact: 4 }, { low: 9, medium: 11 }).riskBand).toBe("unassessed");
  });
});
