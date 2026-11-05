import "@test/slow";
import { beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { i18n } from "@test/utils";
import { summaryQuery, periodOf, localDayStart } from "../api/executionApi";
import { evaluateExitCriteria, criterionValue } from "../model/exitCriteria";
import { SUMMARY } from "./__fixtures__/summary";
import { buildReportXlsx, type ReportLabels } from "./reportXlsx";
import { reportDocDefinition } from "./reportPdf";
import { autoSummary, buildStatusReport, reportFileName } from "./statusReport";

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o);
const ctx = {
  projectName: "Portal",
  scopeLabel: "Proyecto",
  periodLabel: "Todo el periodo",
  generatedAt: new Date(2026, 10, 5, 10, 0),
  author: "Ada",
  planTitle: "Plan v1",
  lang: "es",
  summary: "Todo bien salvo pagos.",
  recommendations: "Repetir TC-002.",
};
const labels = (): ReportLabels => ({
  sections: {
    identification: t("statusReport.section.identification"),
    progress: t("statusReport.section.progress"),
    results: t("statusReport.section.results"),
    defects: t("statusReport.section.defects"),
    coverage: t("statusReport.section.coverage"),
    exit: t("statusReport.section.exit"),
    issues: t("statusReport.section.issues"),
    summary: t("statusReport.section.summary"),
    recommendations: t("statusReport.section.recommendations"),
  },
  sheets: { summary: "Resumen", results: "Resultados", defects: "Defectos", coverage: "Cobertura" },
  risky: t("statusReport.risky"),
  noRisky: t("statusReport.noRisky"),
  noIssues: t("statusReport.noIssues"),
  noData: t("common.noData"),
});

beforeEach(async () => {
  await i18n.changeLanguage("es");
});

describe("status report model (EJE-03)", () => {
  it("builds the 29119-3 sections from the derivation", () => {
    const r = buildStatusReport(SUMMARY, ctx, t);
    expect(r.identification).toContainEqual(["Ejecuciones incluidas", "RUN-002, RUN-001"]);
    expect(r.progress).toContainEqual(["% ejecutado", "75.0 %"]);
    expect(r.progress).toContainEqual(["Tasa de éxito", "33.3 %"]);
    expect(r.results.rows).toContainEqual(["Re-test", "1"]);
    expect(r.defects.rows[0]).toEqual(["Crítica", "1", "1"]);
    expect(r.defectsNote).toBe("a fecha de hoy");
    expect(r.coverageLine).toBe("Cobertura de requisitos: 2 de 2 (100.0 %).");
    expect(r.risky.rows).toEqual([["REQ-002", "Payment", "20", "Falla"]]);
    expect(r.exit.rows.map((x) => x[3])).toEqual(["No cumple", "No cumple", "Cumple"]);
    expect(r.exitStates).toEqual(["notMet", "notMet", "met"]);
    // Blocked, waiting for a re-test, flaky and outdated, case by case.
    expect(r.issues.rows.map((x) => [x[0], x[2]])).toEqual([
      ["TC-001", "Flaky"],
      ["TC-002", "Pendiente de re-test, Revisión anterior"],
      ["TC-003", "Bloqueado"],
    ]);
    expect(r.summary).toBe(ctx.summary);
    expect(r.recommendations).toBe(ctx.recommendations);
  });

  it("lists uncovered high-risk requirements as risks too, and leaves out other scopes' covered ones", () => {
    const extra = {
      ...SUMMARY,
      requirements: [
        ...SUMMARY.requirements,
        { ...SUMMARY.requirements[1], requirementId: "q3", requirementKey: "REQ-003", title: "Uncovered", covered: false, caseIds: [], executedCases: 0, status: "not_run", inScope: false },
        { ...SUMMARY.requirements[1], requirementId: "q4", requirementKey: "REQ-004", title: "Elsewhere", inScope: false },
      ],
    };
    expect(buildStatusReport(extra, ctx, t).risky.rows.map((r) => r[0])).toEqual(["REQ-002", "REQ-003"]);
  });

  it("prefills the summary from the numbers", () => {
    expect(autoSummary(SUMMARY, t)).toBe(
      "Se han ejecutado 3 de 4 casos (75.0 %), con una tasa de éxito de 33.3 %. Hay 1 defectos abiertos, 1 críticos. Criterios de salida: 1 de 3 cumplidos.",
    );
  });

  it("shows default criteria in the user's language and the plan's as written", async () => {
    await i18n.changeLanguage("en");
    const shown = evaluateExitCriteria(SUMMARY, t);
    expect(shown.map((c) => [c.label, c.state])).toEqual([
      ["% of cases executed", "notMet"],
      ["Open critical defects", "notMet"],
      ["Requirements coverage", "met"],
    ]);
    const own = evaluateExitCriteria(
      { exitCriteria: [{ ...SUMMARY.exitCriteria[0], index: 2, criterion: "Ejecución completa", met: null, value: null }] },
      t,
    );
    expect(own[0]).toMatchObject({ label: "Ejecución completa", state: "noData" });
    // A known kind whose metric cannot be read is checked by hand, not «no data».
    const unreadable = evaluateExitCriteria(
      { exitCriteria: [{ ...SUMMARY.exitCriteria[0], index: 0, metric: "todos", op: null, target: null, met: null }] },
      t,
    );
    expect(unreadable[0].state).toBe("manual");
    expect(criterionValue(SUMMARY.exitCriteria[0])).toBe("75 %");
    expect(criterionValue(SUMMARY.exitCriteria[1])).toBe("1");
  });

  it("names the files by project and day", () => {
    expect(reportFileName("Portal Web", new Date(2026, 10, 5), "pdf", t)).toBe(
      "Informe_de_estado_de_pruebas_Portal_Web_2026-11-05.pdf",
    );
  });
});

describe("status report exports", () => {
  it("writes the .xlsx: summary sections, results, defects and coverage sheets", async () => {
    const buffer = await buildReportXlsx(buildStatusReport(SUMMARY, ctx, t), labels());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Resultados", "Defectos", "Cobertura"]);
    const texts: string[] = [];
    wb.worksheets[0].eachRow((row) => row.eachCell((c) => texts.push(String(c.value))));
    for (const s of Object.values(labels().sections)) expect(texts.join("\n")).toContain(s);
    expect(texts).toContain("Repetir TC-002.");
    const results = wb.getWorksheet("Resultados")!;
    expect(results.getRow(1).getCell(1).value).toBe("Caso");
    expect(results.getRow(2).getCell(1).value).toBe("TC-001");
    expect(results.getRow(2).getCell(4).value).toBe("RUN-002");
    expect(wb.getWorksheet("Cobertura")!.getRow(3).getCell(1).value).toBe("REQ-002");
  });

  it("writes the PDF definition with the nine sections", () => {
    const dd = reportDocDefinition(buildStatusReport(SUMMARY, ctx, t), labels());
    const text = JSON.stringify(dd.content);
    for (const s of Object.values(labels().sections)) expect(text).toContain(s.replace(/"/g, '\\"'));
    expect(text).toContain("a fecha de hoy");
  });
});

describe("execution API helpers", () => {
  it("puts only the set filters in the query", () => {
    expect(summaryQuery({ projectId: "p 1", cycleId: "y1", build: "", dayStarts: [1, 2], from: 0 })).toBe(
      "projectId=p+1&cycleId=y1&from=0&dayStarts=1%2C2",
    );
  });

  it("turns local days into [from, to) instants", () => {
    const { from, to } = periodOf("2026-11-01", "2026-11-05");
    expect(from).toBe(localDayStart("2026-11-01"));
    expect(to).toBe(new Date(2026, 10, 6).getTime());
    expect(periodOf(null, null)).toEqual({ from: null, to: null });
  });
});
