import { describe, expect, it } from "vitest";
import { buildMatrix, type MatrixCase, type MatrixDefect, type MatrixRequirement } from "./matrix";

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
        defectKeys: [],
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
