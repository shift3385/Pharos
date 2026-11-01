// Traceability matrix (TRZ-02): requirement ↔ test case ↔ defect, as a pure
// function so the view and the .xlsx export share one source of truth.
// Rules (approved plan, D8):
//  - one row per requirement ↔ case link; a requirement with no case gets one
//    row with the case columns empty;
//  - a requirement is covered when at least one linked case is not obsolete;
//  - execution status is `not_run` until execution exists (v0.0.3, EJE-04);
//  - defects reach a row through the case they are linked to.

import type { RequirementPriority } from "./types";

export type Coverage = "covered" | "not_covered";
export type ExecutionStatus = "passed" | "failed" | "blocked" | "not_run";
export type MatrixNote = "obsoleteCase" | "openDefect";

export interface MatrixRequirement {
  requirementKey: string;
  title: string;
  priority: RequirementPriority;
}

export interface MatrixCase {
  id: string;
  scenarioId: string;
  title: string;
  status: string;
  requirementKeys: string[];
}

export interface MatrixDefect {
  id: string;
  defectKey?: string | null;
  title: string;
  /** Lifecycle status (ADR-0016): open unless closed or rejected. */
  status: string;
  /** Cases it reaches, directly or through a linked result. */
  testCaseIds: string[];
}

/** A defect counts as open unless it is closed or rejected (ADR-0016): a
 *  deferred one is still open. */
export const isOpen = (d: MatrixDefect) => d.status !== "closed" && d.status !== "rejected";

export interface MatrixRow {
  requirementKey: string;
  requirementTitle: string;
  priority: RequirementPriority;
  caseId?: string;
  scenarioId?: string;
  caseTitle?: string;
  executionStatus?: ExecutionStatus;
  defectKeys: string[];
  coverage: Coverage;
  notes: MatrixNote[];
}

export interface UnknownLink {
  caseId: string;
  scenarioId: string;
  requirementKey: string;
}

export interface MatrixGaps {
  uncoveredRequirements: string[];
  casesWithoutRequirement: MatrixCase[];
  unknownLinks: UnknownLink[];
  defectsWithoutCase: MatrixDefect[];
}

export interface MatrixSummary {
  totalRequirements: number;
  covered: number;
  uncovered: number;
  /** 0..1 */
  coverageRatio: number;
  execution: Record<ExecutionStatus, number>;
}

export interface TraceabilityMatrix {
  rows: MatrixRow[];
  gaps: MatrixGaps;
  summary: MatrixSummary;
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** Visible id of a defect: its DEF key, or its title when it has none yet. */
export const defectLabel = (d: MatrixDefect) => d.defectKey || d.title;

export function buildMatrix(
  requirements: MatrixRequirement[],
  cases: MatrixCase[],
  defects: MatrixDefect[],
): TraceabilityMatrix {
  const known = new Set(requirements.map((r) => r.requirementKey));
  const caseIds = new Set(cases.map((c) => c.id));
  const sortedCases = [...cases].sort((a, b) => natural(a.scenarioId, b.scenarioId));
  const defectsOf = (caseId: string) =>
    defects.filter((d) => d.testCaseIds.includes(caseId)).sort((a, b) => natural(defectLabel(a), defectLabel(b)));

  const rows: MatrixRow[] = [];
  const uncoveredRequirements: string[] = [];
  const execution: Record<ExecutionStatus, number> = { passed: 0, failed: 0, blocked: 0, not_run: 0 };

  for (const req of [...requirements].sort((a, b) => natural(a.requirementKey, b.requirementKey))) {
    const linked = sortedCases.filter((c) => c.requirementKeys.includes(req.requirementKey));
    const coverage: Coverage = linked.some((c) => c.status !== "obsolete") ? "covered" : "not_covered";
    if (coverage === "not_covered") uncoveredRequirements.push(req.requirementKey);
    const base = { requirementKey: req.requirementKey, requirementTitle: req.title, priority: req.priority, coverage };

    if (linked.length === 0) {
      rows.push({ ...base, defectKeys: [], notes: [] });
      continue;
    }
    for (const c of linked) {
      const caseDefects = defectsOf(c.id);
      const notes: MatrixNote[] = [];
      if (c.status === "obsolete") notes.push("obsoleteCase");
      if (caseDefects.some(isOpen)) notes.push("openDefect");
      execution.not_run++;
      rows.push({
        ...base,
        caseId: c.id,
        scenarioId: c.scenarioId,
        caseTitle: c.title,
        executionStatus: "not_run",
        defectKeys: caseDefects.map(defectLabel),
        notes,
      });
    }
  }

  const unknownLinks: UnknownLink[] = [];
  for (const c of sortedCases) {
    for (const key of c.requirementKeys) {
      if (!known.has(key)) unknownLinks.push({ caseId: c.id, scenarioId: c.scenarioId, requirementKey: key });
    }
  }

  const total = requirements.length;
  const covered = total - uncoveredRequirements.length;
  return {
    rows,
    gaps: {
      uncoveredRequirements,
      casesWithoutRequirement: sortedCases.filter((c) => !c.requirementKeys.some((k) => known.has(k))),
      unknownLinks,
      defectsWithoutCase: defects.filter((d) => !d.testCaseIds.some((id) => caseIds.has(id))),
    },
    summary: {
      totalRequirements: total,
      covered,
      uncovered: uncoveredRequirements.length,
      coverageRatio: total ? covered / total : 0,
      execution,
    },
  };
}
