// .xlsx export of the traceability matrix (TRZ-02), filling the real template
// (`docs/referencias/PHAROS_Matriz_Trazabilidad_ES.xlsx` / `_EN.xlsx`, copied to
// ../assets) so the layout, styles and sheets stay those of the template:
//  - "Matriz": header in row 5; the sample rows 6–7 are replaced by data rows,
//    which take the zebra style and dropdowns of the template's empty rows;
//  - "Resumen Cobertura": the same cells, with the formulas pointed at the real
//    range and counting distinct requirements (D4), plus cached results;
//  - "Guía": untouched.
// The priority / status / coverage words are read from the template's own
// dropdown lists, so every exported value is one the dropdowns and formulas know.

import ExcelJS from "exceljs";
import { saveFile } from "@shared/export/saveFile";
import templateEs from "../assets/matrix-template-es.xlsx?url";
import templateEn from "../assets/matrix-template-en.xlsx?url";
import type { ExecutionStatus, MatrixNote, TraceabilityMatrix } from "../model/matrix";
import type { RequirementPriority } from "../model/types";

const HEADER_ROW = 5;
const FIRST_ROW = 6;
const TEMPLATE_LAST_ROW = 25;
// Template rows whose (empty) style is reused for even / odd data rows.
const STYLE_ROWS = [8, 9];
const FIRST_COL = 2; // B
const LAST_COL = 10; // J

export interface MatrixMeta {
  documentId: string;
  projectName: string;
  version: string;
  /** Localized text for the comments column. */
  noteLabel: (note: MatrixNote) => string;
}

interface Vocabulary {
  priority: Record<RequirementPriority, string>;
  execution: Record<ExecutionStatus, string>;
  coverage: { covered: string; not_covered: string };
}

/** Reads the words of a dropdown list (`"A,B,C"`) defined on a template cell. */
function listValues(ws: ExcelJS.Worksheet, address: string): string[] {
  const formula = ws.getCell(address).dataValidation?.formulae?.[0];
  if (typeof formula !== "string") throw new Error(`template: no dropdown on ${address}`);
  return formula.replace(/^"|"$/g, "").split(",");
}

function vocabulary(ws: ExcelJS.Worksheet): Vocabulary {
  const [high, medium, low] = listValues(ws, `D${STYLE_ROWS[0]}`);
  const [passed, failed, blocked, notRun] = listValues(ws, `G${STYLE_ROWS[0]}`);
  const [covered, notCovered] = listValues(ws, `I${STYLE_ROWS[0]}`);
  return {
    priority: { high, medium, low },
    execution: { passed, failed, blocked, not_run: notRun },
    coverage: { covered, not_covered: notCovered },
  };
}

/** Estimated height for wrapped text in the widest text column (Excel does not
 *  auto-fit wrapped cells). */
function rowHeight(texts: string[], charsPerLine = 34): number {
  const lines = Math.max(
    1,
    ...texts.map((t) => t.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / charsPerLine)), 0)),
  );
  return Math.max(15, lines * 12 + 4);
}

function sheetRef(name: string): string {
  return /^[A-Za-z0-9_]+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

/** Builds the matrix workbook from a template buffer (no download; testable). */
export async function buildMatrixXlsx(
  matrix: TraceabilityMatrix,
  meta: MatrixMeta,
  template: ArrayBuffer,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template);
  const ws = wb.worksheets[0];
  const summary = wb.worksheets[1];
  const words = vocabulary(ws);

  // Header block (merged C3:D3, F3:G3, I3:J3 — values live in the first cell).
  ws.getCell("C3").value = meta.documentId;
  ws.getCell("F3").value = meta.projectName;
  ws.getCell("I3").value = meta.version;

  // Snapshot the template's data-row styles and dropdowns before overwriting.
  const styleOf = STYLE_ROWS.map((r) => {
    const cells: Partial<ExcelJS.Style>[] = [];
    const validations: (ExcelJS.DataValidation | undefined)[] = [];
    for (let c = FIRST_COL; c <= LAST_COL; c++) {
      const cell = ws.getRow(r).getCell(c);
      cells[c] = JSON.parse(JSON.stringify(cell.style ?? {}));
      validations[c] = cell.dataValidation ? JSON.parse(JSON.stringify(cell.dataValidation)) : undefined;
    }
    return { cells, validations, height: ws.getRow(r).height };
  });

  const lastRow = Math.max(TEMPLATE_LAST_ROW, FIRST_ROW + matrix.rows.length - 1);
  for (let r = FIRST_ROW; r <= lastRow; r++) {
    const i = r - FIRST_ROW;
    const style = styleOf[i % 2];
    const data = matrix.rows[i];
    const values = data
      ? [
          data.requirementKey,
          data.requirementTitle,
          words.priority[data.priority],
          data.scenarioId ?? "",
          data.caseTitle ?? "",
          data.executionStatus ? words.execution[data.executionStatus] : "",
          data.defectKeys.join(", "),
          words.coverage[data.coverage],
          data.notes.map(meta.noteLabel).join(" · "),
        ]
      : [];
    const row = ws.getRow(r);
    for (let c = FIRST_COL; c <= LAST_COL; c++) {
      const cell = row.getCell(c);
      cell.style = JSON.parse(JSON.stringify(style.cells[c]));
      const validation = style.validations[c];
      if (validation) cell.dataValidation = JSON.parse(JSON.stringify(validation));
      const value = values[c - FIRST_COL];
      cell.value = value ? value : null;
    }
    row.height = data ? rowHeight([values[1], values[4], values[8]]) : style.height;
  }

  // Summary: distinct requirements over the real range, with cached results.
  const m = sheetRef(ws.name);
  const range = (col: string) => `${m}!$${col}$${FIRST_ROW}:$${col}$${lastRow}`;
  const B = range("B");
  const I = range("I");
  const G = range("G");
  const distinctWith = (coverage: string) =>
    `SUMPRODUCT((${I}="${coverage}")/COUNTIFS(${B},${B}&"",${I},${I}&""))`;
  const s = matrix.summary;
  summary.getCell("C5").value = { formula: `SUMPRODUCT((${B}<>"")/COUNTIF(${B},${B}&""))`, result: s.totalRequirements };
  summary.getCell("C6").value = { formula: distinctWith(words.coverage.covered), result: s.covered };
  summary.getCell("C7").value = { formula: distinctWith(words.coverage.not_covered), result: s.uncovered };
  summary.getCell("C8").value = { formula: "IFERROR(C6/C5,0)", result: s.coverageRatio };
  const execution: [string, ExecutionStatus][] = [
    ["C11", "passed"],
    ["C12", "failed"],
    ["C13", "blocked"],
    ["C14", "not_run"],
  ];
  for (const [address, status] of execution) {
    summary.getCell(address).value = {
      formula: `COUNTIF(${G},"${words.execution[status]}")`,
      result: s.execution[status],
    };
  }

  wb.calcProperties.fullCalcOnLoad = true;
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Template header row index, exposed for tests. */
export const MATRIX_HEADER_ROW = HEADER_ROW;
export const MATRIX_FIRST_ROW = FIRST_ROW;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Builds and saves the matrix of a project in the given language. The
 *  document version is the plan's (1.0 when the project has no plan). */
export async function exportMatrixXlsx(
  matrix: TraceabilityMatrix,
  projectId: string,
  userId: string,
  projectName: string,
  lang: string,
  t: (key: string) => string,
): Promise<string> {
  const { projectPlanVersion } = await import("@modules/test-plan");
  const url = lang.startsWith("en") ? templateEn : templateEs;
  const template = await fetch(url).then((r) => r.arrayBuffer());
  const buffer = await buildMatrixXlsx(
    matrix,
    {
      documentId: `RTM-${projectName}`,
      projectName,
      version: (await projectPlanVersion(projectId, userId)) ?? "1.0",
      noteLabel: (note) => t(`traceability.note.${note}`),
    },
    template,
  );
  const filename = `RTM_${projectName.replace(/[^\p{L}\p{N}_-]+/gu, "_")}.xlsx`;
  return saveFile(filename, buffer, XLSX_MIME);
}
