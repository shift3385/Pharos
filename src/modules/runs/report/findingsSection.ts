import type { FindingsSummary } from "@shared/contracts/contract";
import type { ReportTable } from "./statusReport";

// «Hallazgos y rendimiento» (ING-06, F5b): the findings and thresholds of
// the latest scan of each tool in the report's scope, for the status report
// and the completion report's residual risks. Pure: texts through `t`.

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export interface FindingsSection {
  /** «N abiertos (1 crítico, …) · N nuevos · N triados · N a revisar». */
  findingsLine: string;
  /** «Umbrales: 4 de 5 cumplidos», or empty without thresholds. */
  thresholdsLine: string;
  /** One row per tool: its latest run and open findings by severity. */
  tools: ReportTable;
  /** The failed thresholds: run, metric, threshold, value, case. */
  failed: ReportTable;
}

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

const metricName = (m: { name: string; aggregation: string | null; scope: string | null }) =>
  [m.name, m.aggregation, m.scope].filter(Boolean).join(" · ");

/** The section, or null when the scope has no findings and no thresholds. */
export function findingsSection(
  f: FindingsSummary | null | undefined,
  /** Case id → its visible key (TC-001). */
  caseKey: (caseId: string) => string,
  t: Translate,
): FindingsSection | null {
  if (!f) return null;
  const open = SEVERITIES.reduce((n, k) => n + f.open[k], 0);
  const bySeverity = SEVERITIES.filter((k) => f.open[k] > 0)
    .map((k) => `${t(`findings.severity.${k}`)}: ${f.open[k]}`)
    .join(", ");
  return {
    findingsLine: t("statusReport.findings.line", {
      count: open,
      bySeverity: bySeverity || "—",
      new: f.new,
      triaged: f.triaged,
      review: f.review,
    }),
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
      ],
      rows: f.tools.map((x) => [
        x.tool || "—",
        x.runKey,
        ...SEVERITIES.map((k) => String(x.open[k])),
        String(x.new),
        String(x.triaged),
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
        metricName(m),
        m.threshold,
        m.unit ? `${m.value} ${m.unit}` : String(m.value),
        m.caseId ? caseKey(m.caseId) : "—",
      ]),
    },
  };
}
