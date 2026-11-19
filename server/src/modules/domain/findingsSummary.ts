// Findings and thresholds of an execution summary (ING-06, F5b), the twin of
// the desktop's `runs/findings/summary.rs`: what the matrix badge, the status
// report and the completion report show. From the runs in the summary's
// scope, the latest run of each tool: its open findings by severity, the new
// and triaged ones, the open ones of each linked case with the worst
// severity, and its thresholds. Pure: the execution loader gathers the input
// (`findingsInputOf`) with the documents it already reads.

import { SEVERITIES } from "./findings.js";

export interface FindingSeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}
export interface ToolFindings {
  tool: string;
  runId: string;
  runKey: string;
  open: FindingSeverityCounts;
  new: number;
  triaged: number;
  review: number;
}
export interface CaseFindings {
  caseId: string;
  open: number;
  worst: string;
}
export interface FailedThreshold {
  runId: string;
  runKey: string;
  name: string;
  aggregation: string | null;
  scope: string | null;
  threshold: string;
  value: number;
  unit: string | null;
  caseId: string | null;
}
export interface FindingsSummary {
  open: FindingSeverityCounts;
  new: number;
  triaged: number;
  review: number;
  tools: ToolFindings[];
  cases: CaseFindings[];
  thresholdsTotal: number;
  thresholdsPassed: number;
  failedThresholds: FailedThreshold[];
}

/** What the summary reads of a project, gathered by the loader. */
export interface FindingsInput {
  /** Live runs, for «previous run of the same tool». */
  runs: { id: string; tool: string; startedAt: string | null; createdAt: string | null }[];
  /** Findings of current shards. */
  findings: { runId: string; fingerprint: string; severity: string; needsReview: boolean; caseId: string | null }[];
  /** Every finding's fingerprint by run (any shard), for «new». */
  fingerprintsByRun: Map<string, Set<string>>;
  /** Metrics with a threshold, of current shards. */
  metrics: {
    id: string;
    runId: string;
    name: string;
    aggregation: string | null;
    scope: string | null;
    value: number;
    unit: string | null;
    threshold: string | null;
    passed: boolean;
    caseId: string | null;
  }[];
  /** The current triage state of each fingerprint. */
  triage: Map<string, string>;
}

export interface SummaryRun {
  id: string;
  runKey: string;
  sourceTool: string | null;
  startedAt: string | null;
}

const zero = (): FindingSeverityCounts => ({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
const add = (c: FindingSeverityCounts, severity: string) => {
  if (severity === "critical" || severity === "high" || severity === "medium" || severity === "low") c[severity]++;
  else c.info++;
};
const rank = (severity: string) => {
  const i = (SEVERITIES as readonly string[]).indexOf(severity);
  return i < 0 ? SEVERITIES.length : i;
};
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The latest run of each tool among `runs` (start, then id), by tool. */
function latestByTool(runs: SummaryRun[]): SummaryRun[] {
  const byTool = new Map<string, SummaryRun>();
  for (const r of runs) {
    const tool = r.sourceTool ?? "";
    const best = byTool.get(tool);
    const newer = !best || cmp(r.startedAt ?? "", best.startedAt ?? "") > 0 ||
      ((r.startedAt ?? "") === (best.startedAt ?? "") && cmp(r.id, best.id) > 0);
    if (newer) byTool.set(tool, r);
  }
  return [...byTool.entries()].sort(([a], [b]) => cmp(a, b)).map(([, r]) => r);
}

/** The fingerprints of the previous run of the same tool with findings
 *  (start or creation, then creation, then id), or null. */
function previousOf(input: FindingsInput, runId: string): Set<string> | null {
  const key = (r: FindingsInput["runs"][number]) => [r.startedAt ?? r.createdAt ?? "", r.createdAt ?? "", r.id];
  const before = (a: string[], b: string[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  };
  const run = input.runs.find((r) => r.id === runId);
  if (!run) return null;
  let best: FindingsInput["runs"][number] | null = null;
  for (const r of input.runs) {
    if (r.id === run.id || r.tool !== run.tool || !input.fingerprintsByRun.has(r.id)) continue;
    if (!before(key(r), key(run))) continue;
    if (!best || before(key(best), key(r))) best = r;
  }
  return best ? (input.fingerprintsByRun.get(best.id) ?? null) : null;
}

/** The findings and thresholds of the summary's runs; null when they have
 *  neither (`findings::summary::of`). */
export function findingsSummary(input: FindingsInput, runs: SummaryRun[]): FindingsSummary | null {
  const latest = latestByTool(runs);
  const out: FindingsSummary = {
    open: zero(),
    new: 0,
    triaged: 0,
    review: 0,
    tools: [],
    cases: [],
    thresholdsTotal: 0,
    thresholdsPassed: 0,
    failedThresholds: [],
  };
  const cases = new Map<string, { open: number; worst: string }>();
  let any = false;
  for (const run of latest) {
    const rows = input.findings.filter((f) => f.runId === run.id);
    if (rows.length > 0) {
      any = true;
      const previous = previousOf(input, run.id);
      const tool: ToolFindings = {
        tool: run.sourceTool ?? "",
        runId: run.id,
        runKey: run.runKey,
        open: zero(),
        new: 0,
        triaged: 0,
        review: 0,
      };
      for (const f of rows) {
        const state = input.triage.get(f.fingerprint);
        if (state !== undefined && state !== "open") {
          tool.triaged++;
          continue;
        }
        if (f.needsReview) {
          tool.review++;
          continue;
        }
        add(tool.open, f.severity);
        add(out.open, f.severity);
        if (previous && !previous.has(f.fingerprint)) tool.new++;
        if (f.caseId) {
          const e = cases.get(f.caseId) ?? { open: 0, worst: f.severity };
          e.open++;
          if (rank(f.severity) < rank(e.worst)) e.worst = f.severity;
          cases.set(f.caseId, e);
        }
      }
      out.new += tool.new;
      out.triaged += tool.triaged;
      out.review += tool.review;
      out.tools.push(tool);
    }
    const metrics = input.metrics
      .filter((m) => m.runId === run.id)
      .sort(
        (a, b) =>
          cmp(a.name, b.name) ||
          cmp(a.scope ?? "", b.scope ?? "") ||
          cmp(a.aggregation ?? "", b.aggregation ?? "") ||
          cmp(a.id, b.id),
      );
    for (const m of metrics) {
      any = true;
      out.thresholdsTotal++;
      if (m.passed) {
        out.thresholdsPassed++;
        continue;
      }
      out.failedThresholds.push({
        runId: run.id,
        runKey: run.runKey,
        name: m.name,
        aggregation: m.aggregation,
        scope: m.scope,
        threshold: m.threshold ?? "",
        value: m.value,
        unit: m.unit,
        caseId: m.caseId,
      });
    }
  }
  if (!any) return null;
  out.cases = [...cases.entries()]
    .map(([caseId, e]) => ({ caseId, open: e.open, worst: e.worst }))
    .sort((a, b) => cmp(a.caseId, b.caseId));
  return out;
}
