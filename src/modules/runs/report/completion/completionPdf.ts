import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { baseDoc, dataTable, field, savePdf, section } from "@shared/export/pdfDoc";
import type { CompletionLabels, CompletionReport } from "./completionReport";

// The test completion report as PDF (DOC-01): the eleven sections in the
// order of ISO/IEC/IEEE 29119-3, with the shared document helpers.

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

const subTitle = (text: string): Content => ({ text, style: "value", bold: true, margin: [0, 6, 0, 2] });

/** A free text under a table, only when someone wrote it. */
const note = (label: string, value: string): Content[] =>
  value.trim() ? [subTitle(label), field(value)] : [];

/** The pdfmake document (pure; testable). */
export function completionDocDefinition(r: CompletionReport, l: CompletionLabels): TDocumentDefinitions {
  const s = l.sections;
  const d = r.decision;
  const content: Content[] = [
    { text: r.title, style: "docTitle", margin: [0, 0, 0, 2] },
    { text: `${r.subtitle} · ${r.documentId}`, style: "meta", margin: [0, 0, 0, 2] },
    { text: r.approvalLine, style: "meta", bold: !r.approved, margin: [0, 0, 0, 6] },
    ...section(s.identification, pairsTable(r.identification)),
    ...section(s.summary, field(r.summary)),
    ...section(s.deviations, dataTable(r.deviations.headers, r.deviations.rows, l.noData, ["*", 80, 80, 110])),
    ...note(l.notes, r.deviationsNote),
    ...section(s.evaluation, {
      stack: [
        { text: d.verdictLabel, style: "docTitle", fontSize: 16, margin: [0, 2, 0, 2] },
        field([d.closedLine, d.summaryLine, d.previousLine].filter(Boolean).join(" · ")),
      ],
      unbreakable: true,
    }),
    dataTable(d.criteria.headers, d.criteria.rows, l.noData, ["*", 55, 55, 60, 150]),
    ...section(s.blockers, dataTable(r.blockers.headers, r.blockers.rows, l.noBlockers, [60, "*", 110, 60])),
    ...note(l.notes, r.blockersNote),
    ...section(s.measures, dataTable(r.measures.headers, r.measures.rows, l.noData, ["*", 55, 55, 45, 60, 55])),
    ...section(s.risks, subTitle(l.openDefects)),
    dataTable(r.openDefects.headers, r.openDefects.rows, l.noDefects, [60, "*", 60, 70]),
    subTitle(l.riskyRequirements),
    dataTable(r.riskyRequirements.headers, r.riskyRequirements.rows, l.noRisky, [60, "*", 35, 60, 70]),
    ...note(l.notes, r.risksNote),
    ...section(s.deliverables, dataTable(r.deliverables.headers, r.deliverables.rows, l.noData, ["*", 80, 60])),
    ...section(s.assets, pairsTable(r.assets)),
    ...note(l.notes, r.assetsNote),
    ...section(s.lessons, field(r.lessons)),
    ...section(s.approval, field(r.approvalLine)),
  ];
  return baseDoc(r.title, content);
}

export function exportCompletionPdf(r: CompletionReport, l: CompletionLabels, filename: string): Promise<string> {
  return savePdf(completionDocDefinition(r, l), filename);
}
