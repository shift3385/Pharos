// Metrics and measurable objectives of the plan (PLN-06, ISO/IEC/IEEE
// 29119-3 «metrics», CTFL v4 §5.3.1) and how an exit criterion is linked to
// one (ADR-0040). The kind names, operators and units below are the contract
// agreed with DOC-02/DOC-06: the metrics track keeps the same literals in
// `src/shared/metrics` and in Rust, and the derivation evaluates a linked
// criterion from its metric. Do not rename them.
import type { ClosureCriterion, PlanMetric } from "./types";

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
export type MetricKind = (typeof METRIC_KINDS)[number];

export const METRIC_OPS = [">=", ">", "<=", "<", "="] as const;
export type MetricOp = (typeof METRIC_OPS)[number];

/** `per100cases`: defects per 100 executed cases; `days`: the median from a
 *  defect's creation to «Corregido»; `score`: an own metric's scale. */
export const METRIC_UNITS = ["percent", "count", "per100cases", "days", "score"] as const;
export type MetricUnit = (typeof METRIC_UNITS)[number];

/** The unit of each kind, fixed (the plan locks it). */
export const METRIC_UNIT: Record<MetricKind, MetricUnit> = {
  executed: "percent",
  passRate: "percent",
  coverage: "percent",
  reopenRate: "percent",
  flakyRate: "percent",
  criticalDefects: "count",
  escapedDefects: "count",
  defectDensity: "per100cases",
  fixTime: "days",
};

/** What a new plan starts with: the A3 exit criteria of before (executed,
 *  critical defects, coverage) plus the pass rate, each an exit criterion
 *  but the pass rate. */
export const DEFAULT_METRICS: { kind: MetricKind; op: MetricOp; target: number; exit: boolean }[] = [
  { kind: "executed", op: ">=", target: 95, exit: true },
  { kind: "passRate", op: ">=", target: 90, exit: false },
  { kind: "criticalDefects", op: "=", target: 0, exit: true },
  { kind: "coverage", op: ">=", target: 90, exit: true },
];

export const isMetricKind = (v: unknown): v is MetricKind =>
  typeof v === "string" && (METRIC_KINDS as readonly string[]).includes(v);
export const isMetricOp = (v: unknown): v is MetricOp =>
  typeof v === "string" && (METRIC_OPS as readonly string[]).includes(v);
export const isMetricUnit = (v: unknown): v is MetricUnit =>
  typeof v === "string" && (METRIC_UNITS as readonly string[]).includes(v);

/** The unit a metric is shown with: its kind's, or the own metric's. */
export const unitOf = (m: Pick<PlanMetric, "kind" | "unit">): MetricUnit =>
  m.kind ? METRIC_UNIT[m.kind] : m.unit;

/** A new metric id, unique in the plan. */
export function newMetricId(taken: readonly { id: string }[] = []): string {
  const ids = new Set(taken.map((m) => m.id));
  for (;;) {
    const id = `m-${Math.random().toString(16).slice(2, 10)}`;
    if (!ids.has(id)) return id;
  }
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const OP_SIGN: Record<MetricOp, string> = { ">=": "≥", ">": ">", "<=": "≤", "<": "<", "=": "=" };
export const opSign = (op: MetricOp) => OP_SIGN[op];

/** The number as people write it in that language (`95,5` in Spanish). */
function num(n: number, lang: string): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 2, useGrouping: false }).format(n);
}

/** The metric's name: its kind's label, or the team's own name. */
export const metricName = (m: Pick<PlanMetric, "kind" | "name">, t: Translate) =>
  m.kind ? t(`testPlan.metricKind.${m.kind}`) : m.name.trim();

/** «≥ 95 %», «= 0», «≤ 0,5 / 100 casos», «≤ 3 días»: the objective as the
 *  criterion's metric text and the exports show it. */
export function targetText(m: Pick<PlanMetric, "kind" | "unit" | "op" | "target">, t: Translate, lang: string): string {
  const value = num(m.target, lang);
  const unit = unitOf(m);
  const tail =
    unit === "percent"
      ? `${value} %`
      : unit === "count" || unit === "score"
        ? value
        : `${value} ${t(`testPlan.metricUnitShort.${unit}`, { count: m.target })}`;
  return `${opSign(m.op)} ${tail}`;
}

/** The exit criterion text of a linked metric: its name and its objective.
 *  Written on every save so exports and older readers (0.3) still read it. */
export function linkedText(m: PlanMetric, t: Translate, lang: string): Pick<ClosureCriterion, "criterion" | "metric"> {
  return { criterion: metricName(m, t), metric: targetText(m, t, lang) };
}

/** Rewrites the text of every criterion linked to a metric that still
 *  exists; a link to a missing metric is dropped (the row stays as text). */
export function syncLinkedCriteria(
  criteria: ClosureCriterion[],
  metrics: PlanMetric[],
  t: Translate,
  lang: string,
): ClosureCriterion[] {
  const byId = new Map(metrics.map((m) => [m.id, m]));
  return criteria.map((c) => {
    if (!c.metricId) return c;
    const m = byId.get(c.metricId);
    if (!m) {
      const { metricId: _drop, ...rest } = c;
      return rest;
    }
    return { ...c, ...linkedText(m, t, lang) };
  });
}

/** A stored metric as the plan reads it: unknown kinds or operators become
 *  an own metric or `>=`, a missing target 0 (a hand-edited or newer file
 *  never breaks the wizard). */
export function normalizeMetric(raw: unknown): PlanMetric | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && r.id ? r.id : null;
  if (!id) return null;
  const kind = isMetricKind(r.kind) ? r.kind : null;
  const target = typeof r.target === "number" && Number.isFinite(r.target) ? r.target : 0;
  return {
    id,
    kind,
    name: typeof r.name === "string" ? r.name : "",
    op: isMetricOp(r.op) ? r.op : ">=",
    target,
    unit: kind ? METRIC_UNIT[kind] : isMetricUnit(r.unit) ? r.unit : "score",
    ...(typeof r.note === "string" && r.note ? { note: r.note } : {}),
  };
}

/** Metrics with unique ids (a repeated id gets a new one). */
export function normalizeMetrics(list: unknown): PlanMetric[] {
  if (!Array.isArray(list)) return [];
  const out: PlanMetric[] = [];
  for (const raw of list) {
    const m = normalizeMetric(raw);
    if (!m) continue;
    out.push(out.some((x) => x.id === m.id) ? { ...m, id: newMetricId(out) } : m);
  }
  return out;
}
