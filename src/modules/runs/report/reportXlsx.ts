import ExcelJS from "exceljs";
import { saveFile } from "@shared/export/saveFile";
import { BRAND } from "@shared/export/pdfDoc";
import type { ReportTable, StatusReport } from "./statusReport";

// The status report as .xlsx (EJE-03). There is no reference template for it
// in `docs/referencias/`, so it is built from scratch with the brand colours
// of the other exports: «Resumen» (sections 1–9 in order), «Resultados»
// (the latest result of each case), «Defectos» and «Cobertura».

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

type Sheets = { summary: string; results: string; defects: string; coverage: string; decision: string };

function headerRow(ws: ExcelJS.Worksheet, row: number, headers: string[]) {
  headers.forEach((h, i) => {
    const cell = ws.getRow(row).getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: argb(BRAND.white) } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(BRAND.navy500) } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

/** Writes `table` from `row`; returns the next free row. The helpers
 *  are shared with the test completion report (DOC-01). */
export function table(ws: ExcelJS.Worksheet, row: number, t: ReportTable, empty: string) {
  headerRow(ws, row, t.headers);
  let r = row + 1;
  if (t.rows.length === 0) {
    ws.getRow(r).getCell(1).value = empty;
    ws.getRow(r).getCell(1).font = { italic: true, color: { argb: argb(BRAND.textSecondary) } };
    r++;
  }
  for (const values of t.rows) {
    values.forEach((v, i) => {
      const cell = ws.getRow(r).getCell(i + 1);
      const n = Number(v);
      cell.value = v !== "" && /^-?\d+(\.\d+)?$/.test(v) && Number.isFinite(n) ? n : v || null;
      cell.alignment = { vertical: "top", wrapText: true };
    });
    r++;
  }
  return r + 1;
}

export function section(ws: ExcelJS.Worksheet, row: number, title: string) {
  const cell = ws.getRow(row).getCell(1);
  cell.value = title;
  cell.font = { bold: true, size: 12, color: { argb: argb(BRAND.navy900) } };
  return row + 1;
}

export function pairs(ws: ExcelJS.Worksheet, row: number, list: [string, string][]) {
  let r = row;
  for (const [k, v] of list) {
    ws.getRow(r).getCell(1).value = k;
    ws.getRow(r).getCell(1).font = { bold: true };
    ws.getRow(r).getCell(2).value = v;
    ws.getRow(r).getCell(2).alignment = { wrapText: true, vertical: "top" };
    r++;
  }
  return r + 1;
}

export function text(ws: ExcelJS.Worksheet, row: number, value: string) {
  ws.mergeCells(row, 1, row, 6);
  const cell = ws.getRow(row).getCell(1);
  cell.value = value.trim() || "—";
  cell.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(row).height = Math.max(15, Math.ceil(value.length / 90) * 15);
  return row + 2;
}

/** Section titles in the order of the report (i18n `statusReport.section.*`). */
export interface ReportLabels {
  sections: Record<
    | "decision"
    | "metrics"
    | "identification"
    | "progress"
    | "results"
    | "defects"
    | "coverage"
    | "exit"
    | "issues"
    | "summary"
    | "recommendations",
    string
  >;
  sheets: Sheets;
  risky: string;
  noRisky: string;
  noIssues: string;
  noData: string;
}

/** Builds the workbook (no I/O; testable). */
export async function buildReportXlsx(
  report: StatusReport,
  labels: ReportLabels,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pharos";
  const ws = wb.addWorksheet(labels.sheets.summary);
  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 40;
  for (let c = 3; c <= 6; c++) ws.getColumn(c).width = 14;
  ws.getCell("A1").value = report.title;
  ws.getCell("A1").font = { bold: true, size: 16, color: { argb: argb(BRAND.navy900) } };
  ws.getCell("A2").value = report.subtitle;
  ws.getCell("A2").font = { italic: true, color: { argb: argb(BRAND.textSecondary) } };
  const s = labels.sections;
  let r = 4;
  const d = report.decision;
  if (d) {
    r = section(ws, r, s.decision);
    r = pairs(ws, r, [
      [d.verdictLabel, d.closedLine],
      [d.summaryLine, d.previousLine ?? ""],
    ]);
  }
  r = section(ws, r, s.identification);
  r = pairs(ws, r, report.identification);
  r = section(ws, r, s.progress);
  r = pairs(ws, r, report.progress);
  r = section(ws, r, s.results);
  r = table(ws, r, report.results, labels.noData);
  r = section(ws, r, `${s.defects} (${report.defectsNote})`);
  r = table(ws, r, report.defects, labels.noData);
  r = section(ws, r, s.coverage);
  ws.getRow(r).getCell(1).value = report.coverageLine;
  ws.getRow(r + 1).getCell(1).value = report.bandsLine;
  r += 3;
  r = table(ws, r, report.coverageByRisk, labels.noData);
  // TRZ-04: the weighted coverage, as two rows with a percentage.
  for (const [label, ratio] of report.weightedRows) {
    ws.getRow(r - 1).getCell(1).value = label;
    const cell = ws.getRow(r - 1).getCell(2);
    cell.value = ratio;
    cell.numFmt = "0.0%";
    r++;
  }
  ws.getRow(r - 1).getCell(1).value = labels.risky;
  ws.getRow(r - 1).getCell(1).font = { bold: true };
  r = table(ws, r, report.risky, labels.noRisky);
  r = section(ws, r, s.exit);
  r = table(ws, r, report.exit, labels.noData);
  r = section(ws, r, s.issues);
  r = table(ws, r, report.issues, labels.noIssues);
  r = section(ws, r, s.summary);
  r = text(ws, r, report.summary);
  r = section(ws, r, s.recommendations);
  text(ws, r, report.recommendations);

  const sheet = (name: string, t: ReportTable, widths: number[]) => {
    const w = wb.addWorksheet(name);
    widths.forEach((n, i) => (w.getColumn(i + 1).width = n));
    const end = table(w, 1, t, labels.noData);
    w.views = [{ state: "frozen", ySplit: 1 }];
    if (t.rows.length)
      w.autoFilter = { from: { row: 1, column: 1 }, to: { row: end - 2, column: t.headers.length } };
  };
  if (d) {
    // «Decisión» (DOC-02): the gate's record and the metrics against the
    // previous closed cycle, right after the summary sheet.
    const w = wb.addWorksheet(labels.sheets.decision);
    [34, 14, 14, 16, 60].forEach((n, i) => (w.getColumn(i + 1).width = n));
    w.getCell("A1").value = `${d.verdictLabel} · ${d.closedLine}`;
    w.getCell("A1").font = { bold: true, size: 14, color: { argb: argb(BRAND.navy900) } };
    w.getCell("A2").value = [d.summaryLine, d.previousLine].filter(Boolean).join(" · ");
    let row = table(w, 4, d.criteria, labels.noData);
    row = section(w, row, s.metrics);
    table(w, row, d.metrics, labels.noData);
  }
  sheet(labels.sheets.results, report.cases, [12, 40, 14, 12, 22, 16, 12, 8, 14]);
  sheet(labels.sheets.defects, report.defects, [20, 10, 10]);
  sheet(labels.sheets.coverage, report.requirements, [14, 40, 8, 14, 10, 10, 14, 30]);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function exportReportXlsx(
  report: StatusReport,
  labels: ReportLabels,
  filename: string,
): Promise<string> {
  return saveFile(filename, await buildReportXlsx(report, labels), XLSX_MIME);
}
