import ExcelJS from "exceljs";
import templateEs from "../assets/case-template-es.xlsx?url";
import templateEn from "../assets/case-template-en.xlsx?url";
import type { ExampleTable, Flow, TestCaseData } from "../model/types";

export interface ExportableCase {
  scenarioId: string;
  title: string;
  version: string;
  priority: string; // already localized
  status: string; // already localized
  author: string;
  data: TestCaseData;
  gherkin: string;
  level: "basic" | "outline" | "advanced";
  // Advanced: shared preconditions + flows (main first, then alternatives).
  background?: string[];
  flows?: Flow[];
  // Labels the template does not carry (localized by the caller).
  altFlowLabel?: string;
  examplesLabel?: string;
}

function triggerDownload(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function tableText(ex?: ExampleTable): string {
  if (!ex || !ex.headers.some((h) => h.trim())) return "";
  return [ex.headers, ...ex.rows].map((r) => "| " + r.join(" | ") + " |").join("\n");
}

const list = (a?: string[]) => (a ?? []).map((s) => s.trim()).filter(Boolean).join("\n");
const numbered = (a?: string[]) =>
  (a ?? []).filter((s) => s.trim()).map((s, i) => `${i + 1}. ${s.trim()}`).join("\n");

/** Estimated wrapped-line count for a wrap-text cell of a given character width. */
function visualLines(text: string, charsPerLine: number): number {
  return text
    .split("\n")
    .reduce((n, ln) => n + Math.max(1, Math.ceil((ln.length || 1) / charsPerLine)), 0);
}

/** Grows a row's height to fit multi-line content (Excel does not auto-fit the
 *  height of wrapped/merged cells). */
function growRow(
  sheet: ExcelJS.Worksheet,
  rowNum: number,
  text: string,
  charsPerLine = 78,
  min = 0,
) {
  if (!text) return;
  sheet.getRow(rowNum).height = Math.max(min, visualLines(text, charsPerLine) * 15 + 6);
}

/** Fills the PHAROS case template (chosen by language) with the case data on the
 *  first sheet and the Gherkin equivalent on the "Gherkin" sheet, preserving the
 *  template's own formatting. Advanced cases keep the main flow in the standard
 *  fields and append one styled block per alternative flow (spec §5.4 / §16). */
export async function exportCaseXlsx(c: ExportableCase, lang: string): Promise<string> {
  const url = lang.startsWith("en") ? templateEn : templateEs;
  const buffer = await fetch(url).then((r) => r.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets.find((w) => w.name !== "Gherkin") ?? wb.worksheets[0];
  const gherkinSheet = wb.getWorksheet("Gherkin");

  const d = c.data ?? {};
  const set = (addr: string, value?: string) => {
    if (value != null && value !== "") {
      ws.getCell(addr).value = value;
      // The value cells span B:D and wrap; grow the row to fit multi-line text.
      growRow(ws, Number(addr.replace(/\D/g, "")), value, 78);
    }
  };

  // Header (all levels).
  set("B4", c.title);
  set("D4", c.scenarioId);
  set("B6", d.mappedUseCase);
  set("D6", c.version);
  set("B8", d.caseDate);
  set("D8", c.priority);
  set("B10", d.traceability);
  set("B12", c.author);
  set("D12", c.status);
  set("B15", d.description);
  set("B27", list(d.postconditions));
  set("B29", list(d.acceptanceCriteria));
  set("B33", d.notes);

  if (c.level === "advanced" && c.flows && c.flows.length > 0) {
    const [main, ...alt] = c.flows;
    // Main flow into the standard body; shared Background sits in preconditions.
    set("B17", list([...(c.background ?? []), ...(main.preconditions ?? [])]));
    set("B19", numbered(main.steps));
    set("B25", main.expectedResult);
    set("B31", [d.testData, tableText(main.examples)].filter(Boolean).join("\n\n"));
    appendAltFlows(ws, alt, {
      altFlow: c.altFlowLabel ?? "ALTERNATIVE FLOW",
      preconditions: String(ws.getCell("B16").value ?? "PRECONDITIONS"),
      steps: String(ws.getCell("B18").value ?? "TEST STEPS"),
      expected: String(ws.getCell("B24").value ?? "EXPECTED RESULT"),
      examples: c.examplesLabel ?? "EXAMPLES",
    });
  } else {
    set("B17", list(d.preconditions));
    set("B19", numbered(d.steps));
    set("B25", d.expectedResult);
    set("B31", [d.testData, tableText(d.examples)].filter(Boolean).join("\n\n"));
  }

  if (gherkinSheet && c.gherkin) {
    gherkinSheet.getCell("B4").value = c.gherkin;
    growRow(gherkinSheet, 4, c.gherkin, 95, 150);
  }

  const filename = `${c.scenarioId || "case"}.xlsx`;
  const out = await wb.xlsx.writeBuffer();
  triggerDownload(out as ArrayBuffer, filename);
  return filename;
}

interface BlockLabels {
  altFlow: string;
  preconditions: string;
  steps: string;
  expected: string;
  examples: string;
}

/** Appends one block per alternative flow below the case body, reusing the
 *  template's own header/label/value cell styles so it stays visually consistent. */
function appendAltFlows(ws: ExcelJS.Worksheet, flows: Flow[], labels: BlockLabels) {
  if (flows.length === 0) return;
  const headerStyle = ws.getCell("B14").style; // navy section bar
  const labelStyle = ws.getCell("B3").style; // field label
  const valueStyle = ws.getCell("B15").style; // value cell

  let r = Math.max(ws.rowCount, 35) + 2;
  const write = (text: string, style: Partial<ExcelJS.Style>) => {
    const cell = ws.getCell(`B${r}`);
    cell.value = text;
    cell.style = style;
    ws.mergeCells(`B${r}:D${r}`);
    r += 1;
  };
  const section = (label: string, value: string) => {
    if (!value) return;
    write(label, labelStyle);
    const valueRow = r;
    write(value, valueStyle);
    growRow(ws, valueRow, value, 78);
  };

  for (const flow of flows) {
    write(`${labels.altFlow}: ${flow.name}`, headerStyle);
    section(labels.preconditions, list(flow.preconditions));
    section(labels.steps, numbered(flow.steps));
    section(labels.expected, flow.expectedResult);
    section(labels.examples, tableText(flow.examples));
    r += 1; // blank spacer row
  }
}
