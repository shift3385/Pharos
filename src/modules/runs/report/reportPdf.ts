import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  baseDoc,
  dataTable,
  field,
  savePdf,
  sectionHeader,
} from "@shared/export/pdfDoc";
import type { ReportLabels } from "./reportXlsx";
import type { StatusReport } from "./statusReport";

// The status report as PDF (EJE-03), with the shared document helpers of the
// plan and case exports (`pdfDoc.ts`): the same nine sections as the .xlsx.

const pairsTable = (list: [string, string][]): Content => ({
  table: {
    widths: [150, "*"],
    body: list.map(([k, v]) => [
      { text: k, style: "value", bold: true },
      { text: v || "—", style: "value" },
    ]),
  },
  layout: "noBorders",
  margin: [0, 0, 0, 4],
});

/** The pdfmake document (pure; testable). */
export function reportDocDefinition(
  report: StatusReport,
  labels: ReportLabels,
): TDocumentDefinitions {
  const s = labels.sections;
  const d = report.decision;
  const content: Content[] = [
    { text: report.title, style: "docTitle", margin: [0, 0, 0, 2] },
    { text: report.subtitle, style: "meta", margin: [0, 0, 0, 6] },
    ...(d
      ? ([
          sectionHeader(s.decision),
          { text: d.verdictLabel, style: "docTitle", fontSize: 16, margin: [0, 2, 0, 2] },
          field([d.closedLine, d.summaryLine, d.previousLine].filter(Boolean).join(" · ")),
          dataTable(d.criteria.headers, d.criteria.rows, labels.noData, ["*", 55, 55, 60, 150]),
          { text: s.metrics, style: "value", bold: true, margin: [0, 6, 0, 2] },
          dataTable(d.metrics.headers, d.metrics.rows, labels.noData, ["*", 70, 70, 60]),
        ] as Content[])
      : []),
    sectionHeader(s.identification),
    pairsTable(report.identification),
    sectionHeader(s.progress),
    pairsTable(report.progress),
    sectionHeader(s.results),
    dataTable(report.results.headers, report.results.rows, labels.noData, ["*", 80]),
    sectionHeader(`${s.defects} (${report.defectsNote})`),
    dataTable(report.defects.headers, report.defects.rows, labels.noData, ["*", 70, 70]),
    sectionHeader(s.coverage),
    field(report.coverageLine),
    dataTable(report.coverageByRisk.headers, report.coverageByRisk.rows, labels.noData),
    { text: labels.risky, style: "value", bold: true, margin: [0, 6, 0, 2] },
    dataTable(report.risky.headers, report.risky.rows, labels.noRisky, [70, "*", 40, 70]),
    sectionHeader(s.exit),
    dataTable(report.exit.headers, report.exit.rows, labels.noData, ["*", 70, 60, 80]),
    sectionHeader(s.issues),
    dataTable(report.issues.headers, report.issues.rows, labels.noIssues, [60, "*", 110, 60]),
    sectionHeader(s.summary),
    field(report.summary),
    sectionHeader(s.recommendations),
    field(report.recommendations),
  ];
  return baseDoc(report.title, content);
}

export function exportReportPdf(
  report: StatusReport,
  labels: ReportLabels,
  filename: string,
): Promise<string> {
  return savePdf(reportDocDefinition(report, labels), filename);
}
