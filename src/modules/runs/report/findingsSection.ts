import i18next from "i18next";
import type { FindingsSummary } from "@shared/contracts/contract";
import { aggregationLabel, formatMetric, formatThreshold, scopeLabel } from "../model/findings";
import type { ReportTable } from "./statusReport";

// «Hallazgos y rendimiento» (ING-06, F5b): the findings and thresholds of
// the latest scan of each tool in the report's scope, for the status report
// and the completion report's residual risks. Pure: texts through `t`.

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export interface FindingsSection {
  /** «N abiertos (Crítica: 1, …) · N nuevos desde el run anterior (or «nuevos:
   *  sin run anterior con el que comparar») · N triados · N a revisar (…)». */
  findingsLine: string;
  /** «Umbrales: 4 de 5 cumplidos», or empty without thresholds. */
  thresholdsLine: string;
  /** One row per tool: its latest run and open findings by severity. */
  tools: ReportTable;
  /** The failed thresholds: run, metric, threshold, value, case. */
  failed: ReportTable;
}

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

/** «http_req_failed · tasa · Caso PH-001»: the aggregation and scope as the
 *  run's «Métricas» says them (FIX-51: the report said «· rate»). */
const metricName = (m: { name: string; aggregation: string | null; scope: string | null }, t: Translate) =>
  [m.name, aggregationLabel(m.aggregation, t), scopeLabel(m.scope, t)].filter(Boolean).join(" · ");

/** The section, or null when the scope has no findings and no thresholds. */
export function findingsSection(
  f: FindingsSummary | null | undefined,
  /** Case id → its visible key (TC-001). */
  caseKey: (caseId: string) => string,
  t: Translate,
  /** The report's language; the app's when left out. */
  lang?: string,
): FindingsSection | null {
  if (!f) return null;
  const locale = lang ?? i18next.resolvedLanguage ?? i18next.language ?? "es";
  const open = SEVERITIES.reduce((n, k) => n + f.open[k], 0);
  const bySeverity = SEVERITIES.filter((k) => f.open[k] > 0)
    .map((k) => `${t(`findings.severity.${k}`)}: ${f.open[k]}`)
    .join(", ");
  // «Nuevo» (ADR-0053 §6) compares with the tool's previous run: a tool
  // imported for the first time has none, so it is not «0 nuevos» (FIX-48).
  // An older summary without `compared` is taken as compared.
  const compared = (x: { compared?: boolean }) => x.compared !== false;
  const anyCompared = f.tools.length === 0 || f.tools.some(compared);
  return {
    findingsLine: [
      t("statusReport.findings.line", { count: open, bySeverity: bySeverity || "—" }),
      // «1 nuevo desde el run anterior · 2 triados» (FIX-47, FIX-48).
      anyCompared ? t("statusReport.findings.new", { count: f.new }) : t("statusReport.findings.newNone"),
      t("statusReport.findings.triaged", { count: f.triaged }),
      // axe's «incomplete» (ADR-0053, decision 4): neither open nor triaged.
      ...(f.review > 0 ? [t("statusReport.findings.review", { count: f.review })] : []),
    ].join(" · "),
    thresholdsLine: f.thresholdsTotal
      ? t("statusReport.findings.thresholds", { passed: f.thresholdsPassed, total: f.thresholdsTotal })
      : "",
    tools: {
      headers: [
        t("statusReport.col.tool"),
        t("statusReport.col.run"),
        ...SEVERITIES.map((k) => t(`findings.severity.${k}`)),
        t("statusReport.col.new"),
        t("statusReport.col.triaged"),
        t("statusReport.col.review"),
      ],
      rows: f.tools.map((x) => [
        x.tool || "—",
        x.runKey,
        ...SEVERITIES.map((k) => String(x.open[k])),
        // No previous run of the tool: nothing to compare with.
        compared(x) ? String(x.new) : "—",
        String(x.triaged),
        String(x.review),
      ]),
    },
    failed: {
      headers: [
        t("statusReport.col.run"),
        t("statusReport.col.metric"),
        t("statusReport.col.threshold"),
        t("statusReport.col.value"),
        t("statusReport.col.case"),
      ],
      rows: f.failedThresholds.map((m) => [
        m.runKey,
        metricName(m, t),
        // In the value's own form (FIX-48): «< 1 %» beside «1,02 %», not
        // k6's «rate<0.01»; the run's «Métricas» keeps the expression.
        formatThreshold({ ...m, unit: m.unit ?? "" }, locale),
        // As the run's «Métricas» tab shows it (FIX-47): a rate as a
        // percentage («1,02 %», not «0.0102 ratio»), durations in ms or s,
        // the number in the report's language.
        formatMetric({ value: m.value, unit: m.unit ?? "" }, locale),
        m.caseId ? caseKey(m.caseId) : "—",
      ]),
    },
  };
}
