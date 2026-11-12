// The execution derivation (step 10, EJE-04/EJE-03; contract v1): the TS twin
// of the desktop's `src-tauri/src/execution/derive.rs`. Pure: no store, no
// clock, no time zone. Both are checked against
// `src-tauri/tests/fixtures/execution-vectors.json`; a change here is a change
// there. The rules (R1–R12) are in ADR-0013 «Implementación (paso 10)».

import { cells, instantMs, NOT_RUN } from "./cycle-progress";

export const CONTRACT_VERSION = 1;
export const RETEST = "retest";

// ---- input ------------------------------------------------------------------------

export interface RunData {
  id: string;
  runKey: string;
  title: string;
  trigger: string;
  sourceTool?: string | null;
  status: string;
  startedAt?: string | null;
  createdAt: string;
  cycleId?: string | null;
  testPlanId?: string | null;
  configurationId?: string | null;
  build?: string | null;
  environment?: string | null;
}

export interface AttemptData {
  id: string;
  runId: string;
  testKey: string;
  configurationLabel?: string | null;
  attempt?: number;
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  shardImportedAt?: string | null;
  hlc?: string;
  declaredFlaky?: boolean;
  imported?: boolean;
  configurationId?: string | null;
  caseId?: string | null;
  flowId?: string | null;
  rowId?: string | null;
  revisionId?: string | null;
  /** Fingerprint of the executed revision's executable content (loader). */
  execFingerprint?: string | null;
}

export interface CaseData {
  id: string;
  scenarioId: string;
  title: string;
  status: string;
  priority: string;
  requirementKeys?: string[];
  /** Fingerprint of the case's executable content now (loader). */
  execFingerprint?: string | null;
}

export interface RequirementData {
  id: string;
  requirementKey: string;
  title: string;
  priority: string;
  riskLikelihood?: number | null;
  riskImpact?: number | null;
}

export interface DefectData {
  id: string;
  defectKey: string;
  severity: string;
  status: string;
  caseIds?: string[];
  requirementIds?: string[];
  /** The run it was found in: «found in the scope» (DOC-06). */
  foundInRunId?: string | null;
  createdAt?: string | null;
  /** `data.lifecycle.fixedAt`: the first time it reached `fixed`. */
  fixedAt?: string | null;
  /** `data.lifecycle.reopens`. */
  reopens?: number;
  /** `data.escaped` (DOC-06, D4). */
  escaped?: boolean;
}

export interface CycleData {
  id: string;
  testPlanId?: string | null;
  configurationIds?: string[];
  cycleKey?: string;
  title?: string;
  status?: string;
  /** The latest of `data.closures` (DOC-02), raw. */
  closure?: unknown;
}

export interface CycleItemData {
  id: string;
  cycleId: string;
  caseId: string;
  flowId?: string | null;
  rowId?: string | null;
}

export interface CriterionData {
  criterion: string;
  metric: string;
  /** The plan metric that measures it (PLN-06). */
  metricId?: string | null;
  /** Mandatory (absent, the default) or advisory (false) (DOC-02, D2). */
  blocking?: boolean | null;
}

/** A plan metric (PLN-06 `data.metrics[]`); kind null = judged by hand. */
export interface PlanMetricData {
  id: string;
  kind?: string | null;
  op?: string;
  target?: number | null;
}

export interface ProjectData {
  projectId: string;
  runs?: RunData[];
  attempts?: AttemptData[];
  cases?: CaseData[];
  requirements?: RequirementData[];
  defects?: DefectData[];
  cycles?: CycleData[];
  cycleItems?: CycleItemData[];
  planCriteria?: CriterionData[] | null;
  planMetrics?: PlanMetricData[] | null;
  /** The project's risk bands (TRZ-04); absent or invalid → the defaults. */
  riskBands?: RiskBands | null;
}

/** A level up to `low` is low, up to `medium` medium, above high. */
export interface RiskBands {
  low: number;
  medium: number;
}
export const DEFAULT_RISK_BANDS: RiskBands = { low: 4, medium: 12 };

/** The pair when `1 ≤ low < medium ≤ 24` (integers), else null. */
export function checkedBands(low: unknown, medium: unknown): RiskBands | null {
  return Number.isInteger(low) && Number.isInteger(medium) && 1 <= (low as number) && (low as number) < (medium as number) && (medium as number) <= 24
    ? { low: low as number, medium: medium as number }
    : null;
}

export function riskBandOf(level: number, bands: RiskBands): "low" | "medium" | "high" {
  return level <= bands.low ? "low" : level <= bands.medium ? "medium" : "high";
}

export interface ExecutionFilter {
  projectId: string;
  cycleId?: string | null;
  testPlanId?: string | null;
  configurationId?: string | null;
  build?: string | null;
  environment?: string | null;
  from?: number | null;
  to?: number | null;
  dayStarts?: number[] | null;
}

export interface HomeRequest {
  projectIds?: string[] | null;
  dayStarts: number[];
  now: number;
  /** RED-W4: `toIndex` ends the window before that day instead of at `now`. */
  windows: { id: string; fromIndex: number; toIndex?: number | null }[];
  queueLimit?: number | null;
}

// ---- output -----------------------------------------------------------------------

export interface StatusCounts {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  other: number;
  notRun: number;
  retest: number;
}
export interface ExecutionProgress extends StatusCounts {
  total: number;
  executed: number;
}
export interface LastResult {
  resultId: string;
  runId: string;
  runKey: string;
  runTitle: string;
  trigger: string;
  sourceTool: string | null;
  origin: "manual" | "imported";
  at: string | null;
  status: string;
  configurationLabel: string | null;
  flaky: boolean;
  revisionId: string | null;
  stale: boolean;
}
export interface CaseExecution {
  caseId: string;
  scenarioId: string;
  title: string;
  priority: string;
  caseStatus: string;
  requirementKeys: string[];
  status: string;
  last: LastResult | null;
  flowId: string | null;
  rowId: string | null;
  defectIds: string[];
}
export interface TargetExecution {
  caseId: string;
  flowId: string | null;
  rowId: string | null;
  status: string;
  last: LastResult;
}
export interface RequirementExecution {
  requirementId: string;
  requirementKey: string;
  title: string;
  priority: string;
  riskLikelihood: number | null;
  riskImpact: number | null;
  riskLevel: number | null;
  riskBand: string;
  covered: boolean;
  caseIds: string[];
  executedCases: number;
  status: string;
  defectIds: string[];
  inScope: boolean;
}
export interface RiskCoverage {
  requirements: number;
  covered: number;
  executed: number;
  passed: number;
  failed: number;
}
export interface CoverageSummary {
  requirements: number;
  covered: number;
  coverageRatio: number | null;
  executed: number;
  passed: number;
  byRisk: Record<"high" | "medium" | "low" | "unassessed", RiskCoverage>;
  riskBands: RiskBands;
  weighted: WeightedCoverage;
}
/** Each assessed requirement weighs its risk level (TRZ-04, ADR-0043). */
export interface WeightedCoverage {
  totalWeight: number;
  coveredWeight: number;
  passedWeight: number;
  coverageRatio: number | null;
  passedRatio: number | null;
  unassessed: number;
}
type Severity = "critical" | "major" | "minor" | "trivial";
export interface DefectSummary {
  total: number;
  open: number;
  bySeverity: Record<Severity, { total: number; open: number }>;
  openBySeverity: Record<Severity, number>;
  byStatus: Record<string, number>;
}
export interface ExitCriterion {
  index: number | null;
  criterion: string;
  metric: string;
  kind: string | null;
  op: string | null;
  target: number | null;
  value: number | null;
  met: boolean | null;
  blocking: boolean;
}

/** The catalog's values (DOC-06): percentages 0–100, density per 100
 *  executed cases, fix time in days. */
export interface MetricValues {
  executed: number | null;
  passRate: number | null;
  criticalDefects: number | null;
  coverage: number | null;
  defectDensity: number | null;
  escapedDefects: number | null;
  fixTime: number | null;
  reopenRate: number | null;
  flakyRate: number | null;
}
export interface CycleMetrics {
  values: MetricValues;
  executedCases: number;
  defectsFound: number;
  defectsFixed: number;
  defectsUnfixed: number;
  defectsReopened: number;
  escapeRate: number | null;
}
export interface ClosureCriterion {
  index: number | null;
  criterion: string;
  metric: string;
  kind: string | null;
  op: string | null;
  target: number | null;
  value: number | null;
  blocking: boolean;
  state: string;
  manualMet: boolean | null;
  justification: string | null;
}
export interface CycleClosure {
  closedAt: string;
  closedBy: string;
  verdict: string;
  planId: string | null;
  criteria: ClosureCriterion[];
  metrics: CycleMetrics;
}
export interface CycleTrendPoint {
  cycleId: string;
  cycleKey: string;
  title: string;
  status: "closed" | "active";
  closedAt: string | null;
  verdict: string | null;
  values: MetricValues;
}
export interface MetricObjective {
  kind: string;
  op: string;
  target: number;
}
export interface DailyCount {
  dayStart: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  other: number;
  total: number;
  manual: number;
  imported: number;
}
export interface RunRef {
  id: string;
  runKey: string;
  title: string;
  trigger: string;
  sourceTool: string | null;
  status: string;
  startedAt: string | null;
  cycleId: string | null;
  configurationId: string | null;
  build: string | null;
  environment: string | null;
}
export interface ExecutionSummary {
  contractVersion: 1;
  projectId: string;
  filter: Required<Omit<ExecutionFilter, "dayStarts">> & { dayStarts: number[] | null };
  progress: ExecutionProgress;
  progressUnit: "case" | "cell";
  passRate: number | null;
  lastExecutedAt: string | null;
  cases: CaseExecution[];
  targets: TargetExecution[];
  requirements: RequirementExecution[];
  coverage: CoverageSummary;
  defects: DefectSummary;
  exitCriteria: ExitCriterion[];
  metrics: CycleMetrics;
  closure: CycleClosure | null;
  previous: CycleTrendPoint | null;
  daily: DailyCount[];
  undated: number;
  runs: RunRef[];
  options: { builds: string[]; environments: string[] };
}
/** By case (R8, amended by NC-029): a case counts once with the progress
 *  rule (`decide`), so it passes only if every target passes. Unlinked tests
 *  stay out of the rate and are counted apart. */
export interface WindowCounts extends StatusCounts {
  executed: number;
  passRate: number | null;
  unlinked: number;
}
export interface QueueRef {
  caseId: string;
  scenarioId: string;
  title: string;
  priority: string;
  flowId: string | null;
  rowId: string | null;
  lastAt: string | null;
}
export interface HomeProject {
  projectId: string;
  counts: ExecutionProgress;
  lastExecutedAt: string | null;
  defects: { open: number; openBySeverity: Record<Severity, number> };
  coverage: number | null;
  exitCriteria: ExitCriterion[];
  queue: {
    notRun: QueueRef[];
    blocked: QueueRef[];
    retest: QueueRef[];
    counts: { notRun: number; blocked: number; retest: number };
  };
  trend: CycleTrendPoint[];
  objectives: MetricObjective[];
}
export interface HomeMetrics {
  contractVersion: 1;
  daily: DailyCount[];
  undated: number;
  windows: Record<string, WindowCounts>;
  projects: HomeProject[];
}

// ---- helpers ----------------------------------------------------------------------

const isDigit = (c: number) => c >= 48 && c <= 57;
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const cmpOpt = (a: string | null | undefined, b: string | null | undefined) => {
  if ((a ?? null) === (b ?? null)) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return cmpStr(a, b);
};

/** Natural order of keys, as `derive::natural_cmp` (byte-wise on ASCII; keys
 *  are ASCII). Never `localeCompare`. */
export function naturalCmp(a: string, b: string): number {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  let i = 0;
  let j = 0;
  const trim = (d: Buffer) => {
    let n = 0;
    while (n < d.length - 1 && d[n] === 48) n++;
    return d.subarray(n);
  };
  while (i < x.length && j < y.length) {
    if (isDigit(x[i]) && isDigit(y[j])) {
      const [si, sj] = [i, j];
      while (i < x.length && isDigit(x[i])) i++;
      while (j < y.length && isDigit(y[j])) j++;
      const p = trim(x.subarray(si, i));
      const q = trim(y.subarray(sj, j));
      if (p.length !== q.length) return p.length < q.length ? -1 : 1;
      const o = Buffer.compare(p, q);
      if (o !== 0) return o;
    } else {
      if (x[i] !== y[j]) return x[i] < y[j] ? -1 : 1;
      i++;
      j++;
    }
  }
  const [rx, ry] = [x.length - i, y.length - j];
  if (rx !== ry) return rx < ry ? -1 : 1;
  return Buffer.compare(x, y);
}

/** The time of an attempt in ms and as stored (`derive.rs::time_of`). */
function timeOf(a: AttemptData): [number, string] | null {
  for (const s of [a.finishedAt, a.startedAt, a.shardImportedAt]) {
    if (typeof s === "string") {
      const ms = instantMs(s);
      if (ms !== null) return [ms, s];
    }
  }
  return null;
}

/** Time (missing first), attempt, HLC, id — `derive.rs::cmp`. */
function cmp(a: AttemptData, b: AttemptData): number {
  const [x, y] = [timeOf(a)?.[0] ?? null, timeOf(b)?.[0] ?? null];
  if (x !== y) {
    if (x === null) return -1;
    if (y === null) return 1;
    return x < y ? -1 : 1;
  }
  const [p, q] = [a.attempt ?? 0, b.attempt ?? 0];
  if (p !== q) return p < q ? -1 : 1;
  const [h, k] = [a.hlc ?? "", b.hlc ?? ""];
  if (h !== k) return h < k ? -1 : 1;
  return cmpStr(a.id, b.id);
}

const testOf = (a: AttemptData) => JSON.stringify([a.runId, a.testKey, a.configurationLabel ?? ""]);

const maxBy = <T>(list: T[], c: (a: T, b: T) => number): T | undefined =>
  list.reduce<T | undefined>((m, a) => (m === undefined || c(a, m) > 0 ? a : m), undefined);

/** failed > blocked > other > skipped > passed (`runs::derive::severity`). */
const severity = (s: string) =>
  s === "failed" ? 4 : s === "blocked" ? 3 : s === "skipped" ? 1 : s === "passed" ? 0 : 2;

/** The worst of `statuses` (the last of the highest, as Rust's `max_by_key`). */
const worst = (statuses: string[]): string | null =>
  statuses.length ? statuses.reduce((w, s) => (severity(s) >= severity(w) ? s : w)) : null;

function finals(attempts: AttemptData[]): { finals: AttemptData[]; flaky: Set<string> } {
  const last = new Map<string, AttemptData>();
  const failed = new Map<string, string[]>();
  for (const a of attempts) {
    const k = testOf(a);
    const cur = last.get(k);
    if (!cur || cmp(a, cur) > 0) last.set(k, a);
    if (a.status === "failed") failed.set(k, [...(failed.get(k) ?? []), a.id]);
  }
  const flaky = new Set<string>();
  for (const [k, a] of last) {
    const before = (failed.get(k) ?? []).some((id) => id !== a.id);
    if (a.status === "passed" && (before || a.declaredFlaky)) flaky.add(k);
  }
  return { finals: [...last.values()].sort((a, b) => cmpStr(a.id, b.id)), flaky };
}

/** The run of the latest of `group`, the worst within it, and its latest. */
function decide(group: AttemptData[]): AttemptData | null {
  const latest = maxBy(group, cmp);
  if (!latest) return null;
  const inRun = group.filter((a) => a.runId === latest.runId).sort((a, b) => cmpStr(a.status, b.status));
  const w = worst(inRun.map((a) => a.status));
  return maxBy(
    inRun.filter((a) => a.status === w),
    cmp,
  )!;
}

const priorityRank = (p: string) =>
  p === "critical" ? 0 : p === "high" ? 1 : p === "medium" ? 2 : p === "low" ? 3 : 4;
const isOpenDefect = (s: string) => s !== "closed" && s !== "rejected";
const ratio = (n: number, d: number) => (d > 0 ? n / d : null);
const trimmed = (v: string | null | undefined) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
};

const emptyCounts = (): StatusCounts => ({ passed: 0, failed: 0, blocked: 0, skipped: 0, other: 0, notRun: 0, retest: 0 });
function countStatus(c: StatusCounts, status: string) {
  if (status === "passed" || status === "failed" || status === "blocked" || status === "skipped") c[status]++;
  else if (status === NOT_RUN) c.notRun++;
  else if (status === RETEST) c.retest++;
  else c.other++;
}
function countProgress(p: ExecutionProgress, status: string) {
  countStatus(p, status);
  p.total++;
  if (status !== NOT_RUN) p.executed++;
}
const sev = <T>(f: () => T): Record<Severity, T> => ({ critical: f(), major: f(), minor: f(), trivial: f() });
const isSeverity = (s: string): s is Severity => s === "critical" || s === "major" || s === "minor" || s === "trivial";

// ---- exit criteria (R11) ------------------------------------------------------------

const FOLD: Record<string, string> = {
  á: "a", à: "a", ä: "a", â: "a",
  é: "e", è: "e", ë: "e", ê: "e",
  í: "i", ì: "i", ï: "i", î: "i",
  ó: "o", ò: "o", ö: "o", ô: "o",
  ú: "u", ù: "u", ü: "u", û: "u",
  ñ: "n",
};
const fold = (s: string) => [...s.toLowerCase()].map((c) => FOLD[c] ?? c).join("");

export function criterionKind(text: string): string | null {
  const t = fold(text);
  const otherSeverity = ["mayor", "major", "menor", "minor", "trivial", "alta", "high"].some((w) => t.includes(w));
  // «Defectos críticos o mayores»: more than the critical ones.
  if (t.includes("defect") && t.includes("critic")) return otherSeverity ? null : "criticalDefects";
  // «Casos críticos ejecutados»: a subset the derivation does not measure.
  if (t.includes("critic")) return null;
  // Before «executed»: «Cobertura de requisitos ejecutados» is coverage.
  if (t.includes("cobertura") || t.includes("coverage")) return "coverage";
  if (t.includes("exito") || t.includes("pass rate") || t.includes("aprobad") || t.includes("passed")) return "passRate";
  if (t.includes("ejecutad") || t.includes("executed") || t.includes("execution")) return "executed";
  return null;
}

const OPS: [string, string][] = [
  ["≥", ">="],
  ["≤", "<="],
  [">=", ">="],
  ["<=", "<="],
  [">", ">"],
  ["<", "<"],
  ["=", "="],
];

export function parseMetric(metric: string, kind: string): [string, number] | null {
  const s = metric.trim();
  let op: string | null = null;
  let rest = s;
  for (const [p, o] of OPS) {
    if (s.startsWith(p)) {
      op = o;
      rest = s.slice(p.length);
      break;
    }
  }
  rest = rest.trim();
  if (rest.endsWith("%")) rest = rest.slice(0, -1).trim();
  if (!/^\d(?:[\d]*[.,]?[\d]*\d)?$/.test(rest) || (rest.match(/[.,]/g) ?? []).length > 1) return null;
  const n = Number(rest.replace(",", "."));
  if (Number.isNaN(n)) return null;
  return [op ?? (kind === "criticalDefects" ? "=" : ">="), n];
}

const round1 = (x: number) => Math.round(x * 10) / 10;

const DEFAULT_CRITERIA: [string, string][] = [
  ["% de casos ejecutados", "≥ 95%"],
  ["Defectos críticos abiertos", "0"],
  ["Cobertura de requisitos", "≥ 90%"],
];

/** The metric catalog (DOC-06, ADR-0041), as `derive.rs`. */
export const METRIC_KINDS = [
  "executed",
  "passRate",
  "criticalDefects",
  "coverage",
  "defectDensity",
  "escapedDefects",
  "fixTime",
  "reopenRate",
  "flakyRate",
] as const;
export const METRIC_OPS = [">=", ">", "<=", "<", "="] as const;
const knownKind = (k: unknown): string | null =>
  typeof k === "string" && (METRIC_KINDS as readonly string[]).includes(k) ? k : null;
const knownOp = (o: unknown): string | null =>
  typeof o === "string" && (METRIC_OPS as readonly string[]).includes(o.trim()) ? o.trim() : null;

export function compare(value: number, op: string, target: number): boolean {
  return op === ">="
    ? value >= target
    : op === ">"
      ? value > target
      : op === "<="
        ? value <= target
        : op === "<"
          ? value < target
          : value === target;
}

/** How a criterion is measured (`derive.rs::measure_of`): by its linked plan
 *  metric, else by its text (plans before 0.4.0, a link to a deleted
 *  metric); a link to a metric without a known kind is judged by hand. */
function measureOf(c: CriterionData, metrics: PlanMetricData[]): [string | null, [string, number] | null] {
  const linked = c.metricId ? metrics.find((m) => m.id === c.metricId) : undefined;
  if (linked) {
    const kind = knownKind(linked.kind);
    if (!kind) return [null, null];
    const target = typeof linked.target === "number" ? linked.target : null;
    return [kind, target === null ? null : [knownOp(linked.op) ?? ">=", target]];
  }
  const kind = criterionKind(c.criterion ?? "");
  return [kind, kind ? parseMetric(c.metric ?? "", kind) : null];
}

const valueOf = (v: MetricValues, kind: string): number | null =>
  (v as unknown as Record<string, number | null>)[kind] ?? null;

function exitCriteria(
  plan: CriterionData[] | null | undefined,
  metrics: PlanMetricData[],
  values: MetricValues,
): ExitCriterion[] {
  const written = (plan ?? [])
    .map((c, i) => [i, c] as [number | null, CriterionData])
    .filter(([, c]) => (c.criterion ?? "").trim() !== "");
  const list = written.length
    ? written
    : DEFAULT_CRITERIA.map(([criterion, metric]) => [null, { criterion, metric }] as [number | null, CriterionData]);
  return list.map(([index, c]) => {
    const [kind, parsed] = measureOf(c, metrics);
    const value = kind ? valueOf(values, kind) : null;
    const met = parsed && value !== null ? compare(value, parsed[0], parsed[1]) : null;
    return {
      index,
      criterion: c.criterion ?? "",
      metric: c.metric ?? "",
      kind,
      op: parsed?.[0] ?? null,
      target: parsed?.[1] ?? null,
      value,
      met,
      blocking: c.blocking ?? true,
    };
  });
}

/** The plan's measurable objectives: metrics with a known kind and a target. */
function objectives(metrics: PlanMetricData[]): MetricObjective[] {
  return metrics.flatMap((m) => {
    const kind = knownKind(m.kind);
    if (!kind || typeof m.target !== "number") return [];
    return [{ kind, op: knownOp(m.op) ?? ">=", target: m.target }];
  });
}

// ---- metrics (DOC-06) --------------------------------------------------------------

const DAY_MS = 86_400_000;

function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const textOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const emptyValues = (): MetricValues => ({
  executed: null,
  passRate: null,
  criticalDefects: null,
  coverage: null,
  defectDensity: null,
  escapedDefects: null,
  fixTime: null,
  reopenRate: null,
  flakyRate: null,
});

/** A stored closing as `derive.rs` reads it (serde's defaults). */
export function normClosure(raw: unknown): CycleClosure | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = rec(raw);
  const m = rec(r.metrics);
  const v = rec(m.values);
  const values = emptyValues();
  for (const k of METRIC_KINDS) values[k] = num(v[k]);
  return {
    closedAt: text(r.closedAt),
    closedBy: text(r.closedBy),
    verdict: text(r.verdict),
    planId: textOrNull(r.planId),
    criteria: (Array.isArray(r.criteria) ? r.criteria : []).map((x) => {
      const c = rec(x);
      return {
        index: num(c.index),
        criterion: text(c.criterion),
        metric: text(c.metric),
        kind: textOrNull(c.kind),
        op: textOrNull(c.op),
        target: num(c.target),
        value: num(c.value),
        blocking: c.blocking === true,
        state: text(c.state),
        manualMet: typeof c.manualMet === "boolean" ? c.manualMet : null,
        justification: textOrNull(c.justification),
      };
    }),
    metrics: {
      values,
      executedCases: num(m.executedCases) ?? 0,
      defectsFound: num(m.defectsFound) ?? 0,
      defectsFixed: num(m.defectsFixed) ?? 0,
      defectsUnfixed: num(m.defectsUnfixed) ?? 0,
      defectsReopened: num(m.defectsReopened) ?? 0,
      escapeRate: num(m.escapeRate),
    },
  };
}

/** The cycle each escaped defect is charged to (`derive.rs::escape_cycles`):
 *  the latest cycle closed at or before the defect was created. */
function escapeCycles(data: ProjectData): Map<string, string> {
  const closed: [number, string][] = [];
  for (const c of data.cycles ?? []) {
    if (c.status !== "closed") continue;
    const cl = normClosure(c.closure);
    const t = cl ? instantMs(cl.closedAt) : null;
    if (t !== null) closed.push([t, c.id]);
  }
  closed.sort((a, b) => a[0] - b[0] || cmpStr(a[1], b[1]));
  const out = new Map<string, string>();
  for (const d of data.defects ?? []) {
    if (!d.escaped || !d.createdAt) continue;
    const created = instantMs(d.createdAt);
    if (created === null) continue;
    let n = 0;
    while (n < closed.length && closed[n][0] <= created) n++;
    if (n > 0) out.set(d.id, closed[n - 1][1]);
  }
  return out;
}

/** The catalog's metrics over the scope (`derive.rs::scope_metrics`). */
function scopeMetrics(
  data: ProjectData,
  filter: { cycleId: string | null; testPlanId: string | null },
  f: {
    scopedRuns: Set<string>;
    cyclePlan: Map<string, string | null>;
    cases: CaseExecution[];
    progress: ExecutionProgress;
    passRate: number | null;
    openCritical: number;
    coverage: number | null;
  },
): CycleMetrics {
  const executedCases = f.cases.filter((c) => c.status !== NOT_RUN).length;
  const flaky = f.cases.filter((c) => c.status !== NOT_RUN && c.last?.flaky).length;
  const defects = data.defects ?? [];
  const found = defects.filter((d) => !d.escaped && !!d.foundInRunId && f.scopedRuns.has(d.foundInRunId));
  const charged = escapeCycles(data);
  const escaped = defects.filter((d) => {
    if (!d.escaped) return false;
    const cycle = charged.get(d.id);
    if (filter.cycleId) return cycle === filter.cycleId;
    if (filter.testPlanId) return cycle !== undefined && (f.cyclePlan.get(cycle) ?? null) === filter.testPlanId;
    return true;
  }).length;
  const days = found.flatMap((d) => {
    const c = d.createdAt ? instantMs(d.createdAt) : null;
    const x = d.fixedAt ? instantMs(d.fixedAt) : null;
    return c === null || x === null ? [] : [Math.max(x - c, 0) / DAY_MS];
  });
  const fixed = found.filter((d) => !!d.fixedAt).length;
  const reopened = found.filter((d) => (d.reopens ?? 0) > 0).length;
  const reachedFix = found.filter((d) => !!d.fixedAt || (d.reopens ?? 0) > 0).length;
  const pct = (n: number, d: number) => (d > 0 ? round1((n / d) * 100) : null);
  const fix = median(days);
  return {
    values: {
      executed: pct(f.progress.executed, f.progress.total),
      passRate: f.passRate === null ? null : round1(f.passRate * 100),
      criticalDefects: f.openCritical,
      coverage: f.coverage === null ? null : round1(f.coverage * 100),
      defectDensity: pct(found.length, executedCases),
      escapedDefects: escaped,
      fixTime: fix === null ? null : round1(fix),
      reopenRate: pct(reopened, reachedFix),
      flakyRate: pct(flaky, executedCases),
    },
    executedCases,
    defectsFound: found.length,
    defectsFixed: fixed,
    defectsUnfixed: found.length - fixed,
    defectsReopened: reopened,
    escapeRate: pct(escaped, escaped + found.length),
  };
}

// ---- the quality gate (DOC-02) -----------------------------------------------------

export const MIN_JUSTIFICATION = 20;
export const MAX_JUSTIFICATION = 2000;

export interface CloseDecision {
  position: number;
  manualMet?: boolean | null;
  justification?: string | null;
}
export interface CycleCloseInput {
  verdict?: string | null;
  decisions?: CloseDecision[];
}

export function criterionState(c: ExitCriterion): "met" | "notMet" | "noData" | "manual" {
  if (c.kind === null || c.op === null) return "manual";
  return c.met === null ? "noData" : c.met ? "met" : "notMet";
}

/** `derive.rs::close_record`: the closing record, or the first rule broken. */
export function closeRecord(
  summary: ExecutionSummary,
  input: CycleCloseInput,
  planId: string | null,
  now: string,
  user: string,
): { ok: true; closure: CycleClosure } | { ok: false; error: string } {
  const criteria: ClosureCriterion[] = [];
  let failingBlocking = false;
  for (const [pos, c] of summary.exitCriteria.entries()) {
    const decision = (input.decisions ?? []).find((d) => d.position === pos);
    const state = criterionState(c);
    const manualMet = typeof decision?.manualMet === "boolean" ? decision.manualMet : null;
    if (state === "manual" && manualMet === null) return { ok: false, error: `gate-manual-unset:${pos}` };
    const failing = state === "met" ? false : state === "manual" ? manualMet === false : true;
    const trimmedText = (decision?.justification ?? "").trim();
    const justification = trimmedText === "" ? null : trimmedText;
    const len = justification ? [...justification].length : 0;
    if (len > MAX_JUSTIFICATION) return { ok: false, error: `gate-justification-too-long:${pos}` };
    if (failing && c.blocking) {
      failingBlocking = true;
      if (len < MIN_JUSTIFICATION) return { ok: false, error: `gate-justification-required:${pos}` };
    }
    criteria.push({
      index: c.index,
      criterion: c.criterion,
      metric: c.metric,
      kind: c.kind,
      op: c.op,
      target: c.target,
      value: c.value,
      blocking: c.blocking,
      state,
      manualMet: state === "manual" ? manualMet : null,
      justification: failing ? justification : null,
    });
  }
  let verdict = "go";
  if (failingBlocking) {
    if (input.verdict !== "goWithRisks" && input.verdict !== "noGo") return { ok: false, error: "gate-verdict-required" };
    verdict = input.verdict;
  }
  return { ok: true, closure: { closedAt: now, closedBy: user, verdict, planId, criteria, metrics: summary.metrics } };
}

// ---- daily (R9) ------------------------------------------------------------------

function bucket(dayStarts: number[], t: number): number | null {
  let lo = 0;
  let hi = dayStarts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dayStarts[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? null : lo - 1;
}
const emptyDaily = (ds: number[]): DailyCount[] =>
  ds.map((d) => ({ dayStart: d, passed: 0, failed: 0, blocked: 0, skipped: 0, other: 0, total: 0, manual: 0, imported: 0 }));
function addDaily(d: DailyCount, a: AttemptData) {
  if (a.status === "passed" || a.status === "failed" || a.status === "blocked" || a.status === "skipped") d[a.status]++;
  else d.other++;
  d.total++;
  if (a.imported) d.imported++;
  else d.manual++;
}

// ---- the per-project summary ---------------------------------------------------------

function deriveResults(data: ProjectData, inScope: AttemptData[]) {
  const { finals: fin, flaky } = finals(inScope);
  const byCase = new Map<string, AttemptData[]>();
  const byTarget = new Map<string, { key: [string, string | null, string | null]; group: AttemptData[] }>();
  for (const f of fin) {
    if (!f.caseId) continue;
    byCase.set(f.caseId, [...(byCase.get(f.caseId) ?? []), f]);
    const key: [string, string | null, string | null] = [f.caseId, f.flowId ?? null, f.rowId ?? null];
    const k = JSON.stringify(key);
    const e = byTarget.get(k) ?? { key, group: [] };
    e.group.push(f);
    byTarget.set(k, e);
  }
  const targets: { key: [string, string | null, string | null]; decisive: AttemptData }[] = [];
  for (const { key, group } of byTarget.values()) {
    const decisive = decide(group);
    if (decisive) targets.push({ key, decisive });
  }
  const states = new Map<string, { fixed: boolean; working: boolean }>();
  for (const d of data.defects ?? []) {
    for (const c of d.caseIds ?? []) {
      const e = states.get(c) ?? { fixed: false, working: false };
      if (d.status === "fixed" || d.status === "retest") e.fixed = true;
      if (d.status === "new" || d.status === "open" || d.status === "in_progress") e.working = true;
      states.set(c, e);
    }
  }
  const caseResults = new Map<string, { status: string; decisive: AttemptData }>();
  for (const [c, group] of byCase) {
    const decisive = decide(group);
    if (!decisive) continue;
    const st = states.get(c);
    const status = decisive.status === "failed" && st?.fixed && !st.working ? RETEST : decisive.status;
    caseResults.set(c, { status, decisive });
  }
  return { caseResults, targets, flaky };
}

function lastResult(
  a: AttemptData,
  runs: Map<string, RunData>,
  cases: Map<string, CaseData>,
  flaky: Set<string>,
): LastResult {
  const run = runs.get(a.runId);
  const current = a.caseId ? cases.get(a.caseId)?.execFingerprint ?? null : null;
  const executed = a.execFingerprint ?? null;
  return {
    resultId: a.id,
    runId: a.runId,
    runKey: run?.runKey ?? "",
    runTitle: run?.title ?? "",
    trigger: run?.trigger ?? "",
    sourceTool: run?.sourceTool ?? null,
    origin: a.imported ? "imported" : "manual",
    at: timeOf(a)?.[1] ?? null,
    status: a.status,
    configurationLabel: a.configurationLabel ?? null,
    flaky: flaky.has(testOf(a)),
    revisionId: a.revisionId ?? null,
    stale: executed !== null && current !== null && executed !== current,
  };
}

/** The summary of one project under `filter` (R1–R12). */
export function summarize(data: ProjectData, rawFilter: ExecutionFilter): ExecutionSummary {
  const filter = {
    projectId: rawFilter.projectId,
    cycleId: trimmed(rawFilter.cycleId),
    testPlanId: trimmed(rawFilter.testPlanId),
    configurationId: trimmed(rawFilter.configurationId),
    build: trimmed(rawFilter.build),
    environment: trimmed(rawFilter.environment),
    from: rawFilter.from ?? null,
    to: rawFilter.to ?? null,
    dayStarts: rawFilter.dayStarts ?? null,
  };
  const runsList = data.runs ?? [];
  const casesList = data.cases ?? [];
  const runs = new Map(runsList.map((r) => [r.id, r] as const));
  const cases = new Map(casesList.map((c) => [c.id, c] as const));
  const cyclePlan = new Map((data.cycles ?? []).map((c) => [c.id, c.testPlanId ?? null] as const));

  const runOk = (r: RunData) =>
    (!filter.cycleId || r.cycleId === filter.cycleId) &&
    (!filter.testPlanId ||
      r.testPlanId === filter.testPlanId ||
      (!!r.cycleId && cyclePlan.get(r.cycleId) === filter.testPlanId)) &&
    (!filter.build || trimmed(r.build) === filter.build) &&
    (!filter.environment || trimmed(r.environment) === filter.environment);
  const scopedRuns = new Set(runsList.filter(runOk).map((r) => r.id));
  let undated = 0;
  const inScope: AttemptData[] = [];
  for (const a of data.attempts ?? []) {
    if (!scopedRuns.has(a.runId)) continue;
    if (filter.configurationId && a.configurationId !== filter.configurationId) continue;
    const t = timeOf(a)?.[0] ?? null;
    if (t === null) undated++;
    if (filter.from !== null || filter.to !== null) {
      if (t === null || (filter.from !== null && t < filter.from) || (filter.to !== null && t >= filter.to)) continue;
    }
    inScope.push(a);
  }

  const derived = deriveResults(data, inScope);

  const scope: CaseData[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    const c = cases.get(id);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      scope.push(c);
    }
  };
  if (filter.cycleId) {
    for (const i of data.cycleItems ?? []) if (i.cycleId === filter.cycleId) add(i.caseId);
  } else if (filter.testPlanId) {
    for (const i of data.cycleItems ?? []) if (cyclePlan.get(i.cycleId) === filter.testPlanId) add(i.caseId);
    for (const c of [...derived.caseResults.keys()].sort(cmpStr)) add(c);
  } else {
    for (const c of casesList) if (c.status !== "obsolete") add(c.id);
  }
  const byScenario = (a: CaseData, b: CaseData) => naturalCmp(a.scenarioId, b.scenarioId) || cmpStr(a.id, b.id);
  scope.sort(byScenario);
  const scopeIds = new Set(scope.map((c) => c.id));

  const defectsList = data.defects ?? [];
  const defectById = new Map(defectsList.map((d) => [d.id, d] as const));
  const orderDefects = (ids: string[]) => {
    ids.sort((a, b) => {
      const [x, y] = [defectById.get(a)!, defectById.get(b)!];
      const o = Number(isOpenDefect(y.status)) - Number(isOpenDefect(x.status));
      return o || naturalCmp(x.defectKey, y.defectKey) || cmpStr(x.id, y.id);
    });
    return ids.filter((id, i) => ids[i - 1] !== id);
  };
  // The joins, built once (never a scan per row).
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => m.set(k, [...(m.get(k) ?? []), v]);
  const defectsByCase = new Map<string, DefectData[]>();
  const defectsByRequirement = new Map<string, DefectData[]>();
  for (const d of defectsList) {
    for (const c of d.caseIds ?? []) push(defectsByCase, c, d);
    for (const r of d.requirementIds ?? []) push(defectsByRequirement, r, d);
  }
  const casesByKey = new Map<string, CaseData[]>();
  for (const c of casesList) for (const k of c.requirementKeys ?? []) push(casesByKey, k, c);
  const defectsOfCase = (c: string) => orderDefects((defectsByCase.get(c) ?? []).map((d) => d.id));
  const statusOf = (c: string) => derived.caseResults.get(c)?.status ?? NOT_RUN;

  const caseRows: CaseExecution[] = scope.map((c) => {
    const decisive = derived.caseResults.get(c.id)?.decisive ?? null;
    return {
      caseId: c.id,
      scenarioId: c.scenarioId,
      title: c.title,
      priority: c.priority,
      caseStatus: c.status,
      requirementKeys: c.requirementKeys ?? [],
      status: statusOf(c.id),
      last: decisive ? lastResult(decisive, runs, cases, derived.flaky) : null,
      flowId: decisive?.flowId ?? null,
      rowId: decisive?.rowId ?? null,
      defectIds: defectsOfCase(c.id),
    };
  });

  const progress: ExecutionProgress = { ...emptyCounts(), total: 0, executed: 0 };
  let progressUnit: "case" | "cell" = "case";
  if (filter.cycleId) {
    progressUnit = "cell";
    const cycle = (data.cycles ?? []).find((c) => c.id === filter.cycleId);
    const cols = cycle?.configurationIds?.length ? cycle.configurationIds : [null];
    const items = (data.cycleItems ?? [])
      .filter((i) => i.cycleId === filter.cycleId)
      .map((i) => ({ id: i.id, caseId: i.caseId, flowId: i.flowId ?? null, rowId: i.rowId ?? null }));
    const attempts = inScope.map((a) => ({
      id: a.id,
      runId: a.runId,
      testKey: a.testKey,
      configurationLabel: a.configurationLabel ?? null,
      attempt: a.attempt ?? 0,
      status: a.status,
      startedAt: a.startedAt ?? null,
      finishedAt: a.finishedAt ?? null,
      shardImportedAt: a.shardImportedAt ?? null,
      hlc: a.hlc ?? "",
      configurationId: a.configurationId ?? null,
      caseId: a.caseId ?? null,
      flowId: a.flowId ?? null,
      rowId: a.rowId ?? null,
    }));
    for (const cell of cells(items, cols, attempts)) countProgress(progress, cell.status);
  } else {
    for (const c of caseRows) countProgress(progress, c.status);
  }
  const passRate = ratio(progress.passed, progress.executed);

  let lastAt: [number, string, string] | null = null;
  for (const a of inScope) {
    const t = timeOf(a);
    if (t && (!lastAt || t[0] > lastAt[0] || (t[0] === lastAt[0] && a.id > lastAt[2]))) lastAt = [t[0], t[1], a.id];
  }

  const targets: TargetExecution[] = derived.targets.map(({ key: [caseId, flowId, rowId], decisive }) => ({
    caseId,
    flowId,
    rowId,
    status: decisive.status,
    last: lastResult(decisive, runs, cases, derived.flaky),
  }));
  targets.sort(
    (a, b) =>
      naturalCmp(cases.get(a.caseId)?.scenarioId ?? "", cases.get(b.caseId)?.scenarioId ?? "") ||
      cmpStr(a.caseId, b.caseId) ||
      cmpOpt(a.flowId, b.flowId) ||
      cmpOpt(a.rowId, b.rowId),
  );

  const reqs = [...(data.requirements ?? [])].sort(
    (a, b) => naturalCmp(a.requirementKey, b.requirementKey) || cmpStr(a.id, b.id),
  );
  const band = (): RiskCoverage => ({ requirements: 0, covered: 0, executed: 0, passed: 0, failed: 0 });
  const bands = data.riskBands ? (checkedBands(data.riskBands.low, data.riskBands.medium) ?? DEFAULT_RISK_BANDS) : DEFAULT_RISK_BANDS;
  const coverage: CoverageSummary = {
    requirements: reqs.length,
    covered: 0,
    coverageRatio: null,
    executed: 0,
    passed: 0,
    byRisk: { high: band(), medium: band(), low: band(), unassessed: band() },
    riskBands: { ...bands },
    weighted: { totalWeight: 0, coveredWeight: 0, passedWeight: 0, coverageRatio: null, passedRatio: null, unassessed: 0 },
  };
  const reqRows: RequirementExecution[] = [];
  for (const r of reqs) {
    const linked = (casesByKey.get(r.requirementKey) ?? []).filter((c, i, all) => all[i - 1]?.id !== c.id);
    const live = linked.filter((c) => c.status !== "obsolete");
    const covered = live.length > 0;
    const statuses = live.map((c) => statusOf(c.id));
    const executedCases = statuses.filter((s) => s !== NOT_RUN).length;
    const ranked = statuses
      .filter((s) => s !== NOT_RUN)
      .map((s) => (s === RETEST ? "failed" : s))
      .sort(cmpStr);
    const status = worst(ranked) ?? NOT_RUN;
    const level =
      r.riskLikelihood != null && r.riskImpact != null ? r.riskLikelihood * r.riskImpact : null;
    const riskBand = level === null ? "unassessed" : riskBandOf(level, bands);
    const defectIds = orderDefects(
      [...(defectsByRequirement.get(r.id) ?? []), ...linked.flatMap((c) => defectsByCase.get(c.id) ?? [])].map((d) => d.id),
    );
    const allExecuted = covered && executedCases === live.length;
    coverage.covered += Number(covered);
    coverage.executed += Number(allExecuted);
    coverage.passed += Number(allExecuted && status === "passed");
    const b = coverage.byRisk[riskBand as keyof CoverageSummary["byRisk"]];
    b.requirements++;
    b.covered += Number(covered);
    b.executed += Number(allExecuted);
    b.passed += Number(allExecuted && status === "passed");
    b.failed += Number(status === "failed");
    const w = coverage.weighted;
    if (level === null) w.unassessed++;
    else {
      w.totalWeight += level;
      w.coveredWeight += covered ? level : 0;
      w.passedWeight += allExecuted && status === "passed" ? level : 0;
    }
    reqRows.push({
      requirementId: r.id,
      requirementKey: r.requirementKey,
      title: r.title,
      priority: r.priority,
      riskLikelihood: r.riskLikelihood ?? null,
      riskImpact: r.riskImpact ?? null,
      riskLevel: level,
      riskBand,
      covered,
      // The same cases `executedCases` counts (live, not obsolete).
      caseIds: [...live].sort(byScenario).map((c) => c.id),
      executedCases,
      status,
      defectIds,
      inScope: linked.some((c) => scopeIds.has(c.id)),
    });
  }
  coverage.coverageRatio = ratio(coverage.covered, coverage.requirements);
  coverage.weighted.coverageRatio = ratio(coverage.weighted.coveredWeight, coverage.weighted.totalWeight);
  coverage.weighted.passedRatio = ratio(coverage.weighted.passedWeight, coverage.weighted.totalWeight);

  const scoped = !!filter.cycleId || !!filter.testPlanId;
  const inScopeReqs = new Set(reqRows.filter((r) => r.inScope).map((r) => r.requirementId));
  const defects: DefectSummary = {
    total: 0,
    open: 0,
    bySeverity: sev(() => ({ total: 0, open: 0 })),
    openBySeverity: sev(() => 0),
    byStatus: {},
  };
  for (const d of defectsList) {
    if (
      scoped &&
      !(d.caseIds ?? []).some((c) => scopeIds.has(c)) &&
      !(d.requirementIds ?? []).some((r) => inScopeReqs.has(r))
    )
      continue;
    const open = isOpenDefect(d.status);
    defects.total++;
    defects.open += Number(open);
    if (isSeverity(d.severity)) {
      defects.bySeverity[d.severity].total++;
      defects.bySeverity[d.severity].open += Number(open);
      if (open) defects.openBySeverity[d.severity]++;
    }
    defects.byStatus[d.status] = (defects.byStatus[d.status] ?? 0) + 1;
  }
  defects.byStatus = Object.fromEntries(Object.entries(defects.byStatus).sort(([a], [b]) => cmpStr(a, b)));

  const metrics = scopeMetrics(data, filter, {
    scopedRuns,
    cyclePlan,
    cases: caseRows,
    progress,
    passRate,
    openCritical: defects.openBySeverity.critical,
    coverage: coverage.coverageRatio,
  });

  const ds = filter.dayStarts ?? [];
  const daily = emptyDaily(ds);
  for (const a of inScope) {
    const t = timeOf(a);
    const i = t ? bucket(ds, t[0]) : null;
    if (i !== null) addDaily(daily[i], a);
  }

  const when = (r: RunData) => (r.startedAt ? instantMs(r.startedAt) : null) ?? instantMs(r.createdAt);
  const runRefs = runsList
    .filter((r) => scopedRuns.has(r.id))
    .sort((a, b) => {
      const [x, y] = [when(a), when(b)];
      if (x !== y) {
        if (x === null) return 1;
        if (y === null) return -1;
        return x > y ? -1 : 1;
      }
      return cmpStr(a.id, b.id);
    });
  const distinct = (f: (r: RunData) => string | null | undefined) =>
    [...new Set(runsList.map((r) => trimmed(f(r))).filter((v): v is string => v !== null))].sort(cmpStr);

  return {
    contractVersion: CONTRACT_VERSION,
    projectId: data.projectId,
    filter,
    progress,
    progressUnit,
    passRate,
    lastExecutedAt: lastAt?.[1] ?? null,
    cases: caseRows,
    targets,
    requirements: reqRows,
    coverage,
    defects,
    exitCriteria: exitCriteria(data.planCriteria, data.planMetrics ?? [], metrics.values),
    metrics,
    closure: filter.cycleId ? normClosure((data.cycles ?? []).find((c) => c.id === filter.cycleId)?.closure) : null,
    previous: filter.cycleId ? previousOf(data, filter.cycleId) : null,
    daily,
    undated,
    runs: runRefs.map((r) => ({
      id: r.id,
      runKey: r.runKey,
      title: r.title,
      trigger: r.trigger,
      sourceTool: r.sourceTool ?? null,
      status: r.status,
      startedAt: r.startedAt ?? null,
      cycleId: r.cycleId ?? null,
      configurationId: r.configurationId ?? null,
      build: r.build ?? null,
      environment: r.environment ?? null,
    })),
    options: { builds: distinct((r) => r.build), environments: distinct((r) => r.environment) },
  };
}

// ---- the Home rollup ----------------------------------------------------------------

function queueRefs(cases: CaseExecution[], status: string, limit: number): [QueueRef[], number] {
  const at = (c: CaseExecution) => (c.last?.at ? instantMs(c.last.at) : null);
  const list = cases
    .filter((c) => c.status === status)
    .sort((a, b) => {
      const p = priorityRank(a.priority) - priorityRank(b.priority);
      if (p) return p;
      const [x, y] = [at(a), at(b)];
      if (x !== y) {
        if (x === null) return 1;
        if (y === null) return -1;
        return x > y ? -1 : 1;
      }
      return naturalCmp(a.scenarioId, b.scenarioId) || cmpStr(a.caseId, b.caseId);
    });
  return [
    list.slice(0, limit).map((c) => ({
      caseId: c.caseId,
      scenarioId: c.scenarioId,
      title: c.title,
      priority: c.priority,
      flowId: c.flowId,
      rowId: c.rowId,
      lastAt: c.last?.at ?? null,
    })),
    list.length,
  ];
}

/** The attempts of the project's live runs: a deleted run (EJE-07) keeps its
 *  results live, and every reader hides them through the run. */
function liveAttempts(data: ProjectData): AttemptData[] {
  const runs = new Set((data.runs ?? []).map((r) => r.id));
  return (data.attempts ?? []).filter((a) => runs.has(a.runId));
}

export const TREND_CYCLES = 6;

/** The trend of a project (`derive.rs::trend`). */
function trend(data: ProjectData): CycleTrendPoint[] {
  const closed = closedPoints(data);
  const out = closed.slice(Math.max(closed.length - TREND_CYCLES, 0));
  const active = (data.cycles ?? [])
    .filter((c) => c.status === "active")
    .sort((a, b) => naturalCmp(a.cycleKey ?? "", b.cycleKey ?? "") || cmpStr(a.id, b.id));
  for (const c of active) {
    const s = summarize(data, { projectId: data.projectId, cycleId: c.id });
    out.push({
      cycleId: c.id,
      cycleKey: c.cycleKey ?? "",
      title: c.title ?? "",
      status: "active",
      closedAt: null,
      verdict: null,
      values: s.metrics.values,
    });
  }
  return out;
}

/** The closed cycle before `cycleId` (`derive.rs`, `previous`). */
function previousOf(data: ProjectData, cycleId: string): CycleTrendPoint | null {
  const closed = closedPoints(data);
  const i = closed.findIndex((p) => p.cycleId === cycleId);
  if (i < 0) return closed[closed.length - 1] ?? null;
  return i > 0 ? closed[i - 1] : null;
}

/** Every closed cycle with its closing, oldest first (`derive.rs::closed_points`). */
function closedPoints(data: ProjectData): CycleTrendPoint[] {
  const closed: [number, CycleData, CycleClosure][] = [];
  for (const c of data.cycles ?? []) {
    if (c.status !== "closed") continue;
    const cl = normClosure(c.closure);
    const t = cl ? instantMs(cl.closedAt) : null;
    if (cl && t !== null) closed.push([t, c, cl]);
  }
  closed.sort((a, b) => a[0] - b[0] || cmpStr(a[1].id, b[1].id));
  const charged = [...escapeCycles(data).values()];
  return closed.map(([, c, cl]) => ({
    cycleId: c.id,
    cycleKey: c.cycleKey ?? "",
    title: c.title ?? "",
    status: "closed" as const,
    closedAt: cl.closedAt,
    verdict: cl.verdict,
    values: { ...cl.metrics.values, escapedDefects: charged.filter((id) => id === c.id).length },
  }));
}

/** The Home metrics of `projects` (contract v1 §2.4, R8–R9). */
export function home(allProjects: ProjectData[], request: HomeRequest): HomeMetrics {
  // A project asked for twice counts once.
  const projects = allProjects.filter((p, i, all) => all.findIndex((q) => q.projectId === p.projectId) === i);
  const limit = request.queueLimit ?? 5;
  const ds = request.dayStarts;
  const daily = emptyDaily(ds);
  let undated = 0;
  const out: HomeProject[] = [];
  for (const data of projects) {
    const s = summarize(data, { projectId: data.projectId });
    for (const a of liveAttempts(data)) {
      const t = timeOf(a);
      if (!t) undated++;
      else if (t[0] <= request.now) {
        const i = bucket(ds, t[0]);
        if (i !== null) addDaily(daily[i], a);
      }
    }
    const [notRun, n] = queueRefs(s.cases, NOT_RUN, limit);
    const [blocked, b] = queueRefs(s.cases, "blocked", limit);
    const [retest, r] = queueRefs(s.cases, RETEST, limit);
    out.push({
      projectId: data.projectId,
      counts: s.progress,
      lastExecutedAt: s.lastExecutedAt,
      defects: { open: s.defects.open, openBySeverity: s.defects.openBySeverity },
      coverage: s.coverage.coverageRatio === null ? null : s.coverage.coverageRatio * 100,
      exitCriteria: s.exitCriteria,
      queue: { notRun, blocked, retest, counts: { notRun: n, blocked: b, retest: r } },
      trend: trend(data),
      objectives: objectives(data.planMetrics ?? []),
    });
  }
  const windows: Record<string, WindowCounts> = {};
  for (const w of request.windows) {
    const start = ds[w.fromIndex];
    if (start === undefined) continue;
    // RED-W4: with `toIndex` the window ends before that day (the previous
    // period); without it, or past the last day, at `now`.
    if (w.toIndex != null && w.toIndex <= w.fromIndex) continue;
    const end = w.toIndex != null ? ds[w.toIndex] : undefined;
    const counts: WindowCounts = { ...emptyCounts(), executed: 0, passRate: null, unlinked: 0 };
    for (const data of projects) {
      const inWindow = liveAttempts(data).filter((a) => {
        const t = timeOf(a);
        return !!t && t[0] >= start && t[0] <= request.now && (end === undefined || t[0] < end);
      });
      // By case, as the progress (NC-029); unlinked tests apart.
      const groups = new Map<string, AttemptData[]>();
      const unlinked = new Set<string>();
      for (const f of finals(inWindow).finals) {
        if (f.caseId) groups.set(f.caseId, [...(groups.get(f.caseId) ?? []), f]);
        else unlinked.add(testOf(f));
      }
      counts.unlinked += unlinked.size;
      for (const g of groups.values()) {
        const d = decide(g);
        if (d) {
          countStatus(counts, d.status);
          counts.executed++;
        }
      }
    }
    counts.passRate = ratio(counts.passed, counts.executed);
    windows[w.id] = counts;
  }
  const sortedWindows = Object.fromEntries(Object.entries(windows).sort(([a], [b]) => cmpStr(a, b)));
  return { contractVersion: CONTRACT_VERSION, daily, undated, windows: sortedWindows, projects: out };
}
