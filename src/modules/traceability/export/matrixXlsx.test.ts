import "@test/slow";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildMatrix } from "../model/matrix";
import { buildMatrixXlsx, MATRIX_FIRST_ROW, MATRIX_HEADER_ROW } from "./matrixXlsx";

// A Node Buffer, as the other template tests pass it (exceljs reads it directly).
const template = (lang: "es" | "en") =>
  readFileSync(`src/modules/traceability/assets/matrix-template-${lang}.xlsx`) as unknown as ArrayBuffer;

const matrix = buildMatrix(
  [
    { requirementKey: "REQ-001", title: "Login with valid credentials", priority: "high" },
    { requirementKey: "REQ-002", title: "Password reset", priority: "low" },
  ],
  [
    { id: "a", scenarioId: "TC-001", title: "Login OK", status: "approved", requirementKeys: ["REQ-001"] },
    { id: "b", scenarioId: "TC-002", title: "Login KO", status: "draft", requirementKeys: ["REQ-001"] },
  ],
  [{ id: "d", defectKey: "DEF-014", title: "Error 500", status: "open", testCaseIds: ["b"] }],
);

const meta = {
  documentId: "RTM-Demo",
  projectName: "Demo",
  version: "1.2",
  noteLabel: (n: string) => `note:${n}`,
};

async function load(buffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

describe("buildMatrixXlsx", () => {
  it("fills the Spanish template faithfully: header, rows, template words", async () => {
    const wb = await load(await buildMatrixXlsx(matrix, meta, template("es")));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Matriz", "Resumen Cobertura", "Guía"]);
    const ws = wb.worksheets[0];
    // Template header row untouched.
    expect(ws.getCell(`B${MATRIX_HEADER_ROW}`).value).toBe("ID REQUISITO");
    expect(ws.getCell(`J${MATRIX_HEADER_ROW}`).value).toBe("COMENTARIOS");
    expect([ws.getCell("C3").value, ws.getCell("F3").value, ws.getCell("I3").value]).toEqual([
      "RTM-Demo",
      "Demo",
      "1.2",
    ]);
    const row = (r: number) =>
      ["B", "C", "D", "E", "F", "G", "H", "I", "J"].map((c) => ws.getCell(`${c}${r}`).value ?? "");
    const first = MATRIX_FIRST_ROW;
    expect(row(first)).toEqual([
      "REQ-001", "Login with valid credentials", "Alta", "TC-001", "Login OK", "No ejecutado", "", "Cubierto", "",
    ]);
    expect(row(first + 1)).toEqual([
      "REQ-001", "Login with valid credentials", "Alta", "TC-002", "Login KO", "No ejecutado", "DEF-014", "Cubierto",
      "note:openDefect",
    ]);
    expect(row(first + 2)).toEqual(["REQ-002", "Password reset", "Baja", "", "", "", "", "No cubierto", ""]);
    // The sample rows' content is gone and rows keep the template dropdowns.
    expect(row(first + 3).every((v) => v === "")).toBe(true);
    expect(ws.getCell(`G${first}`).dataValidation?.formulae?.[0]).toBe('"Pasa,Falla,Bloqueado,No ejecutado"');
    // Data rows use the data-row font, not the grey sample font.
    expect(ws.getCell(`B${first}`).font?.color?.argb).toBe("FF1C2530");
  });

  it("points the summary at the real range and counts distinct requirements", async () => {
    const wb = await load(await buildMatrixXlsx(matrix, meta, template("es")));
    const s = wb.worksheets[1];
    const v = (a: string) => s.getCell(a).value as { formula: string; result: number };
    expect(v("C5").formula).toBe('SUMPRODUCT((Matriz!$B$6:$B$25<>"")/COUNTIF(Matriz!$B$6:$B$25,Matriz!$B$6:$B$25&""))');
    expect([v("C5").result, v("C6").result, v("C7").result, v("C8").result]).toEqual([2, 1, 1, 0.5]);
    expect(v("C7").formula).toContain('="No cubierto"');
    expect(v("C14")).toEqual({ formula: 'COUNTIF(Matriz!$G$6:$G$25,"No ejecutado")', result: 2 });
  });

  it("uses the English template words and grows past the template rows", async () => {
    const many = buildMatrix(
      Array.from({ length: 30 }, (_, i) => ({
        requirementKey: `REQ-${String(i + 1).padStart(3, "0")}`,
        title: `R${i + 1}`,
        priority: "medium" as const,
      })),
      [],
      [],
    );
    const wb = await load(await buildMatrixXlsx(many, meta, template("en")));
    const ws = wb.worksheets[0];
    expect(ws.name).toBe("Matrix");
    expect(ws.getCell("B35").value).toBe("REQ-030");
    expect(ws.getCell("D35").value).toBe("Medium");
    expect(ws.getCell("I35").value).toBe("Not Covered");
    expect(ws.getCell("I35").dataValidation?.formulae?.[0]).toBe('"Covered,Not Covered"');
    const s = wb.worksheets[1];
    expect((s.getCell("C7").value as { formula: string }).formula).toContain("Matrix!$I$6:$I$35");
    expect((s.getCell("C7").value as { result: number }).result).toBe(30);
  });

  it("adds the «Resultados» sheet with each case's latest result (EJE-04)", async () => {
    const withRuns = buildMatrix(
      [{ requirementKey: "REQ-001", title: "Login", priority: "high" }],
      [
        { id: "a", scenarioId: "TC-001", title: "Login OK", status: "approved", requirementKeys: ["REQ-001"] },
        { id: "b", scenarioId: "TC-002", title: "Login KO", status: "approved", requirementKeys: ["REQ-001"] },
      ],
      [{ id: "d", defectKey: "DEF-014", title: "Error 500", status: "open", severity: "critical", testCaseIds: ["b"] }],
      {
        cases: [
          {
            caseId: "a",
            status: "skipped",
            last: {
              resultId: "r1", runId: "run2", runKey: "RUN-002", runTitle: "CI", trigger: "import",
              sourceTool: "playwright", origin: "imported", at: "2026-11-02T09:00:01Z", status: "skipped",
              configurationLabel: "chromium", flaky: false, revisionId: "rev", stale: true,
            },
          },
        ],
        requirements: [{ requirementKey: "REQ-001", riskLevel: 20, riskBand: "high" }],
      },
    );
    const t = (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k);
    const wb = await load(
      await buildMatrixXlsx(withRuns, { ...meta, results: { t, filters: ["Ciclo: CYC-001"], date: "05/11/2026" } }, template("es")),
    );
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Matriz", "Resumen Cobertura", "Guía", "traceability.resultsSheet.name"]);
    // The template keeps its own words: skipped is «No ejecutado», the real status in Comments.
    const ws = wb.worksheets[0];
    expect(ws.getCell(`G${MATRIX_FIRST_ROW}`).value).toBe("No ejecutado");
    expect(ws.getCell(`J${MATRIX_FIRST_ROW}`).value).toContain("traceability.execution.skipped");
    const r = wb.worksheets[3];
    expect(String(r.getCell("A2").value)).toContain("Ciclo: CYC-001");
    expect(r.getRow(6).values).toEqual([
      undefined, "REQ-001", 20, "traceability.risk.band.high", "TC-001", "Login OK", "traceability.execution.skipped",
      "RUN-002", "CI", "2026-11-02T09:00:01Z", "chromium", "traceability.result.origin.imported",
      "traceability.resultsSheet.no", "traceability.resultsSheet.yes",
    ]);
    expect(r.getRow(7).getCell(14).value).toBe("DEF-014 (defects.severity.critical)");
  });
});
