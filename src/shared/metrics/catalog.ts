// The metric catalog (DOC-06, ADR-0041): the kinds a plan metric (PLN-06)
// and an exit criterion (DOC-02) can measure. The same literals as
// `src-tauri/src/execution/derive.rs` (`METRIC_KINDS`) and its server twin;
// the test plan declares its own copy of the list, which is the contract.

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

export type MetricUnit = "percent" | "count" | "per100cases" | "days";

/** The unit of each kind: fixed, the plan never chooses it. */
export const METRIC_UNIT: Record<MetricKind, MetricUnit> = {
  executed: "percent",
  passRate: "percent",
  criticalDefects: "count",
  coverage: "percent",
  defectDensity: "per100cases",
  escapedDefects: "count",
  fixTime: "days",
  reopenRate: "percent",
  flakyRate: "percent",
};

/** True when a higher value is better (the trend's colours and arrows). */
export const HIGHER_IS_BETTER: Record<MetricKind, boolean> = {
  executed: true,
  passRate: true,
  criticalDefects: false,
  coverage: true,
  defectDensity: false,
  escapedDefects: false,
  fixTime: false,
  reopenRate: false,
  flakyRate: false,
};

/** The six classic metrics the trend shows (DOC-06), in its order. */
export const TREND_KINDS = [
  "passRate",
  "defectDensity",
  "escapedDefects",
  "fixTime",
  "reopenRate",
  "flakyRate",
] as const satisfies readonly MetricKind[];

export const OP_SYMBOL: Record<MetricOp, string> = {
  ">=": "≥",
  ">": ">",
  "<=": "≤",
  "<": "<",
  "=": "=",
};

export const isMetricKind = (v: unknown): v is MetricKind =>
  typeof v === "string" && (METRIC_KINDS as readonly string[]).includes(v);

/** The i18n key of a kind's name. */
export const metricLabelKey = (kind: MetricKind) => `metrics.kind.${kind}`;

/** `value op target`, as the derivation compares. */
export function meets(value: number, op: string, target: number): boolean {
  switch (op) {
    case ">=":
      return value >= target;
    case ">":
      return value > target;
    case "<=":
      return value <= target;
    case "<":
      return value < target;
    default:
      return value === target;
  }
}

/** A value in its unit: «86,1 %», «4,2», «3 d», «2». */
export function formatMetric(
  kind: MetricKind,
  value: number | null,
  lang?: string,
): string {
  if (value === null) return "—";
  const unit = METRIC_UNIT[kind];
  const n = new Intl.NumberFormat(lang, {
    maximumFractionDigits: unit === "count" ? 0 : 1,
  }).format(value);
  if (unit === "percent") return `${n} %`;
  if (unit === "days") return `${n} d`;
  return n;
}

/** The change from `before` to `now` as text with its sign («+2,0»), and
 *  whether it is an improvement (null when equal or unknown). */
export function metricDelta(
  kind: MetricKind,
  now: number | null,
  before: number | null,
  lang?: string,
): { text: string; better: boolean | null } | null {
  if (now === null || before === null) return null;
  const d = Math.round((now - before) * 10) / 10;
  const text = new Intl.NumberFormat(lang, {
    maximumFractionDigits: METRIC_UNIT[kind] === "count" ? 0 : 1,
    signDisplay: "exceptZero",
  }).format(d);
  return { text, better: d === 0 ? null : d > 0 === HIGHER_IS_BETTER[kind] };
}
