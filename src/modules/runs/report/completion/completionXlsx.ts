import ExcelJS from "exceljs";
import { saveFile } from "@shared/export/saveFile";
import { BRAND } from "@shared/export/pdfDoc";
import { XLSX_MIME, argb, pairs, section, table, text } from "../reportXlsx";
import type { ReportTable } from "../statusReport";
import type { CompletionLabels, CompletionReport } from "./completionReport";

// The test completion report as .xlsx (DOC-01), with the helpers and brand
// colours of the status report: «Informe» (the eleven sections in order),
// «Decisión» (DOC-02's, as the status report writes it), «Medidas»,
// «Riesgos residuales», «Entregables» and «Casos».

/** Builds the workbook (no I/O; testable). `cases` is the status report's
 *  per-case table (the latest result of each case). */
export async function buildCompletionXlsx(
  r: CompletionReport,
  l: CompletionLabels,
  cases: ReportTable,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pharos";
  const s = l.sections;
  const d = r.decision;

  const ws = wb.addWorksheet(l.sheets.report);
  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 40;
  for (let c = 3; c <= 6; c++) ws.getColumn(c).width = 16;
  ws.getCell("A1").value = r.title;
  ws.getCell("A1").font = { bold: true, size: 16, color: { argb: argb(BRAND.navy900) } };
  ws.getCell("A2").value = `${r.subtitle} · ${r.documentId}`;
  ws.getCell("A2").font = { italic: true, color: { argb: argb(BRAND.textSecondary) } };
  ws.getCell("A3").value = r.approvalLine;
  ws.getCell("A3").font = { bold: !r.approved };
  const label = (row: number, value: string) => {
    ws.getRow(row).getCell(1).value = value;
    ws.getRow(row).getCell(1).font = { bold: true };
    return row + 1;
  };
  let row = 5;
  row = section(ws, row, s.identification);
  row = pairs(ws, row, r.identification);
  row = section(ws, row, s.summary);
  row = text(ws, row, r.summary);
  row = section(ws, row, s.deviations);
  row = table(ws, row, r.deviations, l.noData);
  if (r.deviationsNote.trim()) row = text(ws, label(row, l.notes), r.deviationsNote);
  row = section(ws, row, s.evaluation);
  row = pairs(ws, row, [
    [d.verdictLabel, d.closedLine],
    [d.summaryLine, d.previousLine ?? ""],
  ]);
  row = table(ws, row, d.criteria, l.noData);
  row = section(ws, row, s.blockers);
  row = table(ws, row, r.blockers, l.noBlockers);
  if (r.blockersNote.trim()) row = text(ws, label(row, l.notes), r.blockersNote);
  row = section(ws, row, s.measures);
  row = table(ws, row, r.measures, l.noData);
  row = section(ws, row, s.risks);
  row = table(ws, label(row, l.openDefects), r.openDefects, l.noDefects);
  row = table(ws, label(row, l.riskyRequirements), r.riskyRequirements, l.noRisky);
  if (r.risksNote.trim()) row = text(ws, label(row, l.notes), r.risksNote);
  row = section(ws, row, s.deliverables);
  row = table(ws, row, r.deliverables, l.noData);
  row = section(ws, row, s.assets);
  row = pairs(ws, row, r.assets);
  if (r.assetsNote.trim()) row = text(ws, label(row, l.notes), r.assetsNote);
  row = section(ws, row, s.lessons);
  row = text(ws, row, r.lessons);
  row = section(ws, row, s.approval);
  text(ws, row, r.approvalLine);

  // «Decisión» (DOC-02): the gate's record, as the status report writes it.
  const dw = wb.addWorksheet(l.sheets.decision);
  [34, 14, 14, 16, 60].forEach((n, i) => (dw.getColumn(i + 1).width = n));
  dw.getCell("A1").value = `${d.verdictLabel} · ${d.closedLine}`;
  dw.getCell("A1").font = { bold: true, size: 14, color: { argb: argb(BRAND.navy900) } };
  dw.getCell("A2").value = [d.summaryLine, d.previousLine].filter(Boolean).join(" · ");
  const dr = table(dw, 4, d.criteria, l.noData);
  table(dw, section(dw, dr, l.metrics), d.metrics, l.noData);

  const sheet = (name: string, t: ReportTable, widths: number[]) => {
    const w = wb.addWorksheet(name);
    widths.forEach((n, i) => (w.getColumn(i + 1).width = n));
    const end = table(w, 1, t, l.noData);
    w.views = [{ state: "frozen", ySplit: 1 }];
    if (t.rows.length)
      w.autoFilter = { from: { row: 1, column: 1 }, to: { row: end - 2, column: t.headers.length } };
  };
  sheet(l.sheets.measures, r.measures, [30, 14, 14, 12, 16, 14]);
  const rw = wb.addWorksheet(l.sheets.risks);
  [14, 44, 14, 16, 16].forEach((n, i) => (rw.getColumn(i + 1).width = n));
  const bold = (row: number, value: string) => {
    rw.getRow(row).getCell(1).value = value;
    rw.getRow(row).getCell(1).font = { bold: true };
    return row + 1;
  };
  const rr = table(rw, bold(1, l.openDefects), r.openDefects, l.noDefects);
  table(rw, bold(rr, l.riskyRequirements), r.riskyRequirements, l.noRisky);
  sheet(l.sheets.deliverables, r.deliverables, [60, 16, 12]);
  sheet(l.sheets.cases, cases, [12, 40, 14, 12, 22, 16, 12, 8, 14]);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function exportCompletionXlsx(
  r: CompletionReport,
  l: CompletionLabels,
  cases: ReportTable,
  filename: string,
): Promise<string> {
  return saveFile(filename, await buildCompletionXlsx(r, l, cases), XLSX_MIME);
}
