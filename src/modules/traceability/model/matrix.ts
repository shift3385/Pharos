// Traceability matrix (TRZ-02): requirement ↔ test case ↔ defect, as a pure
// function so the view and the .xlsx export share one source of truth.
// Rules (approved plan, D8):
//  - one row per requirement ↔ case link; a requirement with no case gets one
//    row with the case columns empty;
//  - a requirement is covered when at least one linked case is not obsolete;
//  - defects reach a row through the case they are linked to.
// Extended by EJE-04 (step 10): with the execution derivation (contract v1),
// each case row carries its latest final result (status, run, date, flaky,
// stale) and rows are ordered by requirement risk; without it every case is
// `not_run`, as before.

import { isOpenDefect } from "@modules/defects";
import type {
  CaseExecution,
  LastResult,
  RequirementExecution,
} from "@shared/contracts/contract";
import type { RequirementPriority } from "./types";

export type Coverage = "covered" | "not_covered";
export type ExecutionStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "skipped"
  | "other"
  | "retest"
  | "not_run";
export const EXECUTION_STATUSES: ExecutionStatus[] = [
  "passed",
  "failed",
  "retest",
  "blocked",
  "skipped",
  "other",
  "not_run",
];
export type MatrixNote =
  | "obsoleteCase"
  | "openDefect"
  | "retest"
  | "flaky"
  | "stale";
export type RiskBand = "high" | "medium" | "low" | "unassessed";
export type MatrixSort = "risk" | "key";

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
  /** critical | major | minor | trivial (absent in old callers). */
  severity?: string;
  /** Cases it reaches, directly or through a linked result. */
  testCaseIds: string[];
}

/** Open as the defects module says (`isOpenDefect`, ADR-0016): not closed
 *  nor rejected; a deferred one is still open. */
const isOpen = (d: MatrixDefect) => isOpenDefect(d.status);

export interface MatrixRow {
  requirementKey: string;
  requirementTitle: string;
  priority: RequirementPriority;
  caseId?: string;
  scenarioId?: string;
  caseTitle?: string;
  executionStatus?: ExecutionStatus;
  /** The case's latest final result (EJE-04); null when not run. */
  last?: LastResult | null;
  riskLevel: number | null;
  riskBand: RiskBand;
  defectKeys: string[];
  /** The same defects with what the pills need, in the same order. */
  defects: { label: string; severity: string | null; open: boolean }[];
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

/** What the matrix reads of the execution derivation (`ExecutionSummary`). */
export interface MatrixExecution {
  cases: Pick<CaseExecution, "caseId" | "status" | "last">[];
  requirements: Pick<
    RequirementExecution,
    "requirementKey" | "riskLevel" | "riskBand"
  >[];
}

const RISK_RANK: Record<RiskBand, number> = {
  high: 0,
  medium: 1,
  low: 2,
  unassessed: 3,
};

export function buildMatrix(
  requirements: MatrixRequirement[],
  cases: MatrixCase[],
  defects: MatrixDefect[],
  execution?: MatrixExecution | null,
  sort: MatrixSort = "risk",
): TraceabilityMatrix {
  const results = new Map(execution?.cases.map((c) => [c.caseId, c]) ?? []);
  const risks = new Map(
    execution?.requirements.map((r) => [r.requirementKey, r]) ?? [],
  );
  const riskOf = (key: string) => ({
    riskLevel: risks.get(key)?.riskLevel ?? null,
    riskBand: (risks.get(key)?.riskBand ?? "unassessed") as RiskBand,
  });
  const ordered = [...requirements].sort((a, b) => {
    if (sort === "risk") {
      const [x, y] = [riskOf(a.requirementKey), riskOf(b.requirementKey)];
      const band = RISK_RANK[x.riskBand] - RISK_RANK[y.riskBand];
      if (band) return band;
      const level = (y.riskLevel ?? 0) - (x.riskLevel ?? 0);
      if (level) return level;
    }
    return natural(a.requirementKey, b.requirementKey);
  });
  const known = new Set(requirements.map((r) => r.requirementKey));
  const caseIds = new Set(cases.map((c) => c.id));
  const sortedCases = [...cases].sort((a, b) => natural(a.scenarioId, b.scenarioId));
  const defectsOf = (caseId: string) =>
    defects
      .filter((d) => d.testCaseIds.includes(caseId))
      .sort(
        (a, b) =>
          Number(isOpen(b)) - Number(isOpen(a)) ||
          natural(defectLabel(a), defectLabel(b)),
      );

  const rows: MatrixRow[] = [];
  const uncoveredRequirements: string[] = [];
  const executionCounts = Object.fromEntries(
    EXECUTION_STATUSES.map((s) => [s, 0]),
  ) as Record<ExecutionStatus, number>;

  for (const req of ordered) {
    const linked = sortedCases.filter((c) => c.requirementKeys.includes(req.requirementKey));
    const coverage: Coverage = linked.some((c) => c.status !== "obsolete") ? "covered" : "not_covered";
    if (coverage === "not_covered") uncoveredRequirements.push(req.requirementKey);
    const base = {
      requirementKey: req.requirementKey,
      requirementTitle: req.title,
      priority: req.priority,
      coverage,
      ...riskOf(req.requirementKey),
    };

    if (linked.length === 0) {
      rows.push({ ...base, defectKeys: [], defects: [], notes: [] });
      continue;
    }
    for (const c of linked) {
      const caseDefects = defectsOf(c.id);
      const notes: MatrixNote[] = [];
      const result = results.get(c.id);
      const status = (result?.status ?? "not_run") as ExecutionStatus;
      const last = result?.last ?? null;
      if (c.status === "obsolete") notes.push("obsoleteCase");
      if (caseDefects.some(isOpen)) notes.push("openDefect");
      if (status === "retest") notes.push("retest");
      if (last?.flaky) notes.push("flaky");
      if (last?.stale) notes.push("stale");
      executionCounts[status in executionCounts ? status : "other"]++;
      rows.push({
        ...base,
        caseId: c.id,
        scenarioId: c.scenarioId,
        caseTitle: c.title,
        executionStatus: status,
        last,
        defectKeys: caseDefects.map(defectLabel),
        defects: caseDefects.map((d) => ({
          label: defectLabel(d),
          severity: d.severity ?? null,
          open: isOpen(d),
        })),
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
      execution: executionCounts,
    },
  };
}
