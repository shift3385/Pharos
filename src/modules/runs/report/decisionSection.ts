import type { CycleClosure, CycleTrendPoint } from "@shared/contracts/contract";
import {
  METRIC_KINDS,
  TREND_KINDS,
  formatMetric,
  isMetricKind,
  metricDelta,
  metricLabelKey,
  type MetricKind,
} from "@shared/metrics/catalog";
import type { ReportTable } from "./statusReport";

// The go/no-go decision of a closed cycle (DOC-02, boceto B): the first
// section of its status report and of its .xlsx and PDF. Pure and on its own
// so the 29119-3 closure report (DOC-01) can reuse it as it is.

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export interface DecisionSection {
  verdict: "go" | "goWithRisks" | "noGo";
  /** «Go con riesgos». */
  verdictLabel: string;
  /** «Cerrado el 14/11/2026 17:42». */
  closedLine: string;
  /** «4 de 6 criterios se cumplen; 2 obligatorios no, con justificación». */
  summaryLine: string;
  /** «Frente a CYC-006 (Go)», or null without a previous closed cycle. */
  previousLine: string | null;
  /** Criterion, target, value, result, justification. */
  criteria: ReportTable;
  /** Result per row of `criteria` (met | notMet | noData | manual). */
  criteriaStates: string[];
  /** Metric, value, previous cycle, change. */
  metrics: ReportTable;
  /** Per row of `metrics`: the change is an improvement (true), a
   *  worsening (false) or neither (null). */
  metricTrend: (boolean | null)[];
}

const verdictOf = (v: string): DecisionSection["verdict"] =>
  v === "go" || v === "goWithRisks" || v === "noGo" ? v : "noGo";

function value(kind: string | null, v: number | null, lang?: string): string {
  if (v === null) return "—";
  return kind && isMetricKind(kind) ? formatMetric(kind, v, lang) : String(v);
}

export function decisionSection(
  closure: CycleClosure,
  previous: CycleTrendPoint | null,
  t: Translate,
  lang?: string,
): DecisionSection {
  const verdict = verdictOf(closure.verdict);
  const met = closure.criteria.filter((c) =>
    c.state === "manual" ? c.manualMet === true : c.state === "met",
  ).length;
  const failing = closure.criteria.filter(
    (c) => c.blocking && (c.state === "manual" ? c.manualMet === false : c.state !== "met"),
  ).length;
  const at = new Date(closure.closedAt);
  const resultOf = (state: string, manualMet: boolean | null) =>
    state === "manual"
      ? t(manualMet ? "gate.met" : "gate.notMet")
      : t(`statusReport.exit.${state}`);
  // The catalog's six classic metrics, then the ones the criteria used.
  const kinds: MetricKind[] = [
    ...TREND_KINDS,
    ...METRIC_KINDS.filter(
      (k) => !(TREND_KINDS as readonly string[]).includes(k) && closure.criteria.some((c) => c.kind === k),
    ),
  ];
  const deltas = kinds.map((k) =>
    metricDelta(k, closure.metrics.values[k], previous?.values[k] ?? null, lang),
  );
  return {
    verdict,
    verdictLabel: t(`gate.verdict.${verdict}`),
    closedLine: t("gate.report.closedAt", {
      at: Number.isNaN(at.getTime()) ? closure.closedAt : at.toLocaleString(lang),
    }),
    summaryLine: [
      t("gate.report.summary", { met, total: closure.criteria.length }),
      failing ? t("gate.report.failing", { count: failing }) : "",
    ]
      .filter(Boolean)
      .join(" "),
    previousLine: previous
      ? t("gate.report.previous", {
          cycle: previous.cycleKey,
          verdict: previous.verdict ? t(`gate.verdict.${verdictOf(previous.verdict)}`) : "—",
        })
      : null,
    criteria: {
      headers: [
        t("statusReport.col.criterion"),
        t("statusReport.col.target"),
        t("statusReport.col.actual"),
        t("statusReport.col.result"),
        t("gate.report.justification"),
      ],
      rows: closure.criteria.map((c) => [
        c.blocking ? c.criterion : `${c.criterion} (${t("gate.advisory")})`,
        c.metric || "—",
        value(c.kind, c.value, lang),
        resultOf(c.state, c.manualMet),
        c.justification ?? (c.state === "manual" ? t("gate.report.byHand") : "—"),
      ]),
    },
    criteriaStates: closure.criteria.map((c) =>
      c.state === "manual" ? (c.manualMet ? "met" : "notMet") : c.state,
    ),
    metrics: {
      headers: [
        t("gate.report.metric"),
        t("gate.report.value"),
        previous ? previous.cycleKey : t("gate.report.previousNone"),
        t("gate.report.change"),
      ],
      rows: kinds.map((k, i) => [
        t(metricLabelKey(k)),
        formatMetric(k, closure.metrics.values[k], lang),
        previous ? formatMetric(k, previous.values[k], lang) : "—",
        deltas[i]?.text ?? "—",
      ]),
    },
    metricTrend: deltas.map((d) => d?.better ?? null),
  };
}
