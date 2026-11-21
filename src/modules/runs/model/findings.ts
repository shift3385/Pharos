import { formatPercent } from "@shared/i18n/percent";
import type { FindingView, MetricView } from "@shared/contracts/contract";
import type { PillTone } from "@shared/ui/StatusPill";

// The run detail's «Hallazgos» and «Métricas» (ING-06, ADR-0053, F4): what
// the screens derive from the views, kept out of the components so it is
// tested on its own.

export const SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;
export type Severity = (typeof SEVERITIES)[number];

export const TRIAGE_STATES = [
  "open",
  "false_positive",
  "accepted_risk",
  "fixed",
] as const;
export type TriageState = (typeof TRIAGE_STATES)[number];

/** Severity → the pill tone of the design system (no new colours). */
export function severityTone(severity: string): PillTone {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
      return "info";
    default:
      return "neutral";
  }
}

export const severityRank = (s: string) => {
  const i = (SEVERITIES as readonly string[]).indexOf(s);
  return i < 0 ? SEVERITIES.length : i;
};

/** Where a finding stands: `review` (axe could not decide: «A revisar»),
 *  `triaged` (a decision other than open) or `open`. Only `open` counts
 *  (ADR-0053, decision 4 of the user). */
export type FindingStanding = "open" | "review" | "triaged";

export function standingOf(f: FindingView): FindingStanding {
  if (f.triage && f.triage.state !== "open") return "triaged";
  if (f.attributes?.needsReview === true) return "review";
  return "open";
}

/** Open findings by severity (the run list, the matrix badge, the report). */
export function openBySeverity(
  findings: FindingView[],
): Partial<Record<Severity, number>> {
  const out: Partial<Record<Severity, number>> = {};
  for (const f of findings) {
    if (standingOf(f) !== "open") continue;
    const s = f.severity as Severity;
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

export interface RuleGroup {
  key: string;
  ruleId: string;
  ruleName: string | null;
  tool: string | null;
  /** The worst severity among its findings. */
  severity: string;
  helpUri: string | null;
  standardRefs: string[];
  findings: FindingView[];
}

/** Findings by rule (and tool), worst group first, then by rule. */
export function groupByRule(findings: FindingView[]): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const f of findings) {
    const tool =
      typeof f.attributes?.tool === "string"
        ? (f.attributes.tool as string)
        : null;
    const key = `${tool ?? ""}\u0000${f.ruleId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        ruleId: f.ruleId,
        ruleName: f.ruleName,
        tool,
        severity: f.severity,
        helpUri: f.helpUri,
        standardRefs: [],
        findings: [],
      };
      groups.set(key, g);
    }
    g.findings.push(f);
    if (severityRank(f.severity) < severityRank(g.severity))
      g.severity = f.severity;
    for (const r of f.standardRefs)
      if (!g.standardRefs.includes(r)) g.standardRefs.push(r);
  }
  return [...groups.values()].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      a.ruleId.localeCompare(b.ruleId),
  );
}

/** Where a finding is, in one line: `path:line:col`, or the page and the
 *  selector, or the component. */
export function whereOf(f: FindingView): string {
  const l = f.location ?? {};
  const str = (k: string) =>
    typeof l[k] === "string" ? (l[k] as string) : undefined;
  const num = (k: string) =>
    typeof l[k] === "number" ? (l[k] as number) : undefined;
  const uri = str("uri");
  if (uri) {
    const line = num("line");
    const col = num("column");
    return line === undefined
      ? uri
      : col === undefined
        ? `${uri}:${line}`
        : `${uri}:${line}:${col}`;
  }
  const url = str("url");
  const selector = str("selector");
  if (url || selector) return [url, selector].filter(Boolean).join(" · ");
  return str("component") ?? "";
}

// ---- metrics ------------------------------------------------------------------

/** A metric value with its unit, in the reader's language. */
export function formatMetric(
  m: Pick<MetricView, "value" | "unit">,
  locale: string,
): string {
  const n = (v: number, digits = 1) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);
  switch (m.unit) {
    case "ms":
      return m.value >= 1000
        ? `${n(m.value / 1000, 2)} s`
        : `${n(m.value, m.value < 10 ? 2 : 0)} ms`;
    case "ratio":
      return formatPercent(m.value * 100, { lang: locale, digits: 2 });
    case "/s":
      return `${n(m.value)} /s`;
    case "B":
      return m.value >= 1_048_576
        ? `${n(m.value / 1_048_576)} MB`
        : m.value >= 1024
          ? `${n(m.value / 1024)} kB`
          : `${n(m.value, 0)} B`;
    case "count":
      return n(m.value, 0);
    default:
      return n(m.value, 3);
  }
}

/** k6's comparison operators, as a reader writes them. */
const OPERATORS: Record<string, string> = {
  "<": "<",
  "<=": "≤",
  ">": ">",
  ">=": "≥",
  "==": "=",
  "===": "=",
  "!=": "≠",
};

/** One k6 threshold: `aggregation operator number` (`rate<0.01`,
 *  `p(95) < 500`, `count>=10`). */
const THRESHOLD = /^\s*([a-z]+(?:\(\s*[\d.]+\s*\))?)\s*(===|==|!=|<=|>=|<|>)\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*$/i;

const bareAggregation = (a: string) => a.replace(/[\s()]/g, "").toLowerCase();

/** A metric's threshold in the same form as its value (FIX-48): `rate<0.01`
 *  of a rate → «< 1 %», `p(95)<500` of a duration → «< 500 ms». The
 *  aggregation is the metric's own (shown beside it), so only the operator
 *  and the number remain. An expression of another aggregation of the
 *  metric (a counter's `rate`, per second) or one this does not read is
 *  shown as written: the run's «Métricas» keeps k6's own expression. */
export function formatThreshold(
  m: Pick<MetricView, "value" | "unit" | "aggregation"> & { threshold: string | null },
  locale: string,
): string {
  const raw = m.threshold ?? "";
  const parsed = THRESHOLD.exec(raw);
  if (!parsed) return raw;
  const [, aggregation, operator, number] = parsed;
  if (m.aggregation && bareAggregation(m.aggregation) !== bareAggregation(aggregation)) return raw;
  return `${OPERATORS[operator]} ${formatMetric({ value: Number(number), unit: m.unit }, locale)}`;
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** k6's aggregation («rate», «count») in the user's language («tasa»,
 *  «total»); percentiles (p95) read the same in both (FIX-45). Shared by the
 *  run's «Métricas» and the reports (FIX-51: the report said «· rate»). */
export function aggregationLabel(a: string | null | undefined, t: Translate): string {
  return !a ? "" : t(`findings.metric.aggregations.${a}`, { defaultValue: a });
}

/** The k6 tags a metric is scoped to (`case:PH-001`,
 *  `expected_response:true`, several joined by «,»), as a reader says them:
 *  «Caso PH-001», «Respuestas esperadas», «Escenario: login» (FIX-51). A tag
 *  with no name of its own keeps it: «tag: value». */
export function scopeLabel(scope: string | null | undefined, t: Translate): string {
  if (!scope) return "";
  return scope
    .split(",")
    .map((part) => {
      const at = part.indexOf(":");
      if (at < 0) return part.trim();
      const tag = part.slice(0, at).trim();
      const value = part.slice(at + 1).trim();
      if (tag === "expected_response" && (value === "true" || value === "false"))
        return t(`findings.metric.scopes.expected_response_${value}`);
      return t(`findings.metric.scopes.${tag}`, { value, defaultValue: `${tag}: ${value}` });
    })
    .join(" · ");
}

/** Checks: the per-check rates (a scope), apart from the other metrics. */
export const isCheck = (m: MetricView) => m.name === "checks" && !!m.scope;

/** The metrics shown before «Ver todas»: every threshold, plus the usual
 *  summary of each metric (p95 of a trend, the rate, the count or value). */
export function keyMetrics(metrics: MetricView[]): MetricView[] {
  return metrics.filter(
    (m) =>
      !isCheck(m) &&
      (m.threshold !== null ||
        ["p95", "rate", "count", "value"].includes(m.aggregation ?? "")),
  );
}

export interface ThresholdSummary {
  total: number;
  passed: number;
  failed: MetricView[];
}

export function thresholdsOf(metrics: MetricView[]): ThresholdSummary {
  const withThreshold = metrics.filter((m) => m.passed !== null);
  return {
    total: withThreshold.length,
    passed: withThreshold.filter((m) => m.passed === true).length,
    failed: withThreshold.filter((m) => m.passed === false),
  };
}
