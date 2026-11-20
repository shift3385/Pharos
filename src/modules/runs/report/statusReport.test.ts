import "@test/slow";
import { beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { i18n } from "@test/utils";
import { summaryQuery, periodOf, localDayStart } from "../api/executionApi";
import { evaluateExitCriteria, criterionValue } from "../model/exitCriteria";
import { CLOSED, SUMMARY } from "./__fixtures__/summary";
import { buildReportXlsx, type ReportLabels } from "./reportXlsx";
import { reportDocDefinition } from "./reportPdf";
import { autoSummary, buildStatusReport, pct, reportFileName, runKeyList } from "./statusReport";

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
    decision: t("gate.report.section"),
    metrics: t("gate.report.metricsSection"),
    identification: t("statusReport.section.identification"),
    progress: t("statusReport.section.progress"),
    results: t("statusReport.section.results"),
    defects: t("statusReport.section.defects"),
    coverage: t("statusReport.section.coverage"),
    exit: t("statusReport.section.exit"),
    issues: t("statusReport.section.issues"),
    findings: t("statusReport.section.findings"),
    summary: t("statusReport.section.summary"),
    recommendations: t("statusReport.section.recommendations"),
  },
  sheets: { summary: "Resumen", results: "Resultados", defects: "Defectos", coverage: "Cobertura", decision: "Decisión" },
  risky: t("statusReport.risky"),
  noRisky: t("statusReport.noRisky"),
  noIssues: t("statusReport.noIssues"),
  noData: t("common.noData"),
  noFailedThresholds: t("statusReport.findings.noFailed"),
});

beforeEach(async () => {
  await i18n.changeLanguage("es");
});

describe("status report model (EJE-03)", () => {
  it("builds the 29119-3 sections from the derivation", () => {
    const r = buildStatusReport(SUMMARY, ctx, t);
    expect(r.identification).toContainEqual(["Ejecuciones incluidas", "RUN-001, RUN-002"]);
    expect(r.progress).toContainEqual(["% ejecutado", "75 %"]);
    expect(r.progress).toContainEqual(["Tasa de éxito", "33,3 %"]);
    expect(r.results.rows).toContainEqual(["Por confirmar", "1"]);
    expect(r.defects.rows[0]).toEqual(["Crítica", "1", "1"]);
    expect(r.defectsNote).toBe("a fecha de hoy");
    expect(r.coverageLine).toBe("Cobertura de requisitos: 2 de 2 (100 %).");
    // TRZ-04: the project's bands and the coverage weighted by risk.
    expect(r.bandsLine).toBe("Bandas del proyecto: bajo 1–4, medio 5–12, alto 13–25 (probabilidad × impacto).");
    expect(r.weightedLine).toBe(
      "Cobertura ponderada por riesgo: 100 % (aprobada: 16,7 %). Cada requisito pesa su nivel de riesgo; todos están evaluados.",
    );
    expect(r.weightedRows).toEqual([
      ["Cobertura ponderada", 1],
      ["Aprobada ponderada", 4 / 24],
    ]);
    expect(r.risky.rows).toEqual([["REQ-002", "Payment", "20", "Falla"]]);
    expect(r.exit.rows.map((x) => x[3])).toEqual(["No cumple", "No cumple", "Cumple"]);
    expect(r.exitStates).toEqual(["notMet", "notMet", "met"]);
    // Blocked, waiting to be confirmed, flaky and outdated, case by case.
    expect(r.issues.rows.map((x) => [x[0], x[2]])).toEqual([
      ["TC-001", "Flaky"],
      ["TC-002", "Por confirmar, Revisión anterior"],
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
      "Se han ejecutado 3 de 4 casos: 75 %, con una tasa de éxito de 33,3 %. Hay 1 defecto abierto, 1 crítico. Criterios de salida: 1 de 3 cumplidos.",
    );
  });

  it("says one and many defects in the singular and plural (FIX-47)", async () => {
    const many = { ...SUMMARY, defects: { ...SUMMARY.defects, open: 3, openBySeverity: { ...SUMMARY.defects.openBySeverity, critical: 2 } } };
    expect(autoSummary(many, t)).toContain("Hay 3 defectos abiertos, 2 críticos.");
    const none = { ...SUMMARY, defects: { ...SUMMARY.defects, open: 0, openBySeverity: { ...SUMMARY.defects.openBySeverity, critical: 0 } } };
    expect(autoSummary(none, t)).toContain("Hay 0 defectos abiertos, 0 críticos.");
    await i18n.changeLanguage("en");
    expect(autoSummary(SUMMARY, t)).toContain("There is 1 open defect, 1 critical.");
    expect(autoSummary(many, t)).toContain("There are 3 open defects, 2 critical.");
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

  it("adds «Hallazgos y rendimiento» only when there are findings or thresholds (ING-06)", () => {
    expect(buildStatusReport(SUMMARY, ctx, t).findings).toBeNull();
    const f = buildStatusReport(CLOSED, ctx, t).findings!;
    expect(f.findingsLine).toBe(
      "3 hallazgos abiertos (Crítica: 1, Alta: 2) · 1 nuevo desde el run anterior · 1 triado · 2 a revisar (la herramienta no pudo decidir)",
    );
    expect(f.thresholdsLine).toBe("Umbrales: 2 de 3 cumplidos");
    expect(f.tools.headers.slice(-3)).toEqual(["Nuevos", "Triados", "A revisar"]);
    expect(f.tools.rows).toEqual([["axe-core", "RUN-003", "1", "2", "0", "0", "0", "1", "1", "2"]]);
    // The threshold in the value's form (FIX-48).
    expect(f.failed.rows).toEqual([["RUN-004", "http_req_duration · p(95)", "< 500 ms", "812 ms", "TC-002"]]);
  });

  it("a first import has nothing to compare with: no «0 nuevos», and nothing «a revisar» when there is none (FIX-48)", () => {
    // One untriaged axe violation of the tool's first run, as tour 13 imports it.
    const first = {
      ...CLOSED,
      findings: {
        ...CLOSED.findings!,
        open: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
        new: 0,
        triaged: 0,
        review: 0,
        tools: [{ ...CLOSED.findings!.tools[0], open: { critical: 0, high: 1, medium: 0, low: 0, info: 0 }, compared: false, new: 0, triaged: 0, review: 0 }],
      },
    };
    const f = buildStatusReport(first, ctx, t).findings!;
    expect(f.findingsLine).toBe("1 hallazgo abierto (Alta: 1) · nuevos: sin run anterior con el que comparar · 0 triados");
    expect(f.tools.rows[0].slice(-3)).toEqual(["—", "0", "0"]);
  });

  it("shows a failed threshold's value as the run's metrics do, not a raw ratio (FIX-47)", async () => {
    const rate = {
      ...CLOSED,
      findings: {
        ...CLOSED.findings!,
        new: 2,
        triaged: 0,
        failedThresholds: [
          { runId: "r8", runKey: "RUN-008", name: "http_req_failed", aggregation: "rate", scope: null, threshold: "rate<0.01", value: 0.0102, unit: "ratio", caseId: null },
          { runId: "r8", runKey: "RUN-008", name: "http_req_duration", aggregation: "p(95)", scope: null, threshold: "p(95)<500", value: 1534.5, unit: "ms", caseId: null },
        ],
      },
    };
    const f = buildStatusReport(rate, ctx, t).findings!;
    expect(f.findingsLine).toContain("· 2 nuevos desde el run anterior · 0 triados ·");
    expect(f.failed.rows.map((r) => r[3])).toEqual(["1,02 %", "1,53 s"]);
    // The threshold beside it in the same form (FIX-48).
    expect(f.failed.rows.map((r) => r[2])).toEqual(["< 1 %", "< 500 ms"]);
    // The completion report's residual risks use the same section.
    await i18n.changeLanguage("en");
    const en = buildStatusReport(rate, { ...ctx, lang: "en" }, t).findings!;
    expect(en.failed.rows.map((r) => r[3])).toEqual(["1.02 %", "1.53 s"]);
    expect(en.failed.rows.map((r) => r[2])).toEqual(["< 1 %", "< 500 ms"]);
  });

  it("names the files by project and day", () => {
    expect(reportFileName("Portal Web", new Date(2026, 10, 5), "pdf", t)).toBe(
      "Informe_de_estado_de_pruebas_Portal_Web_2026-11-05.pdf",
    );
  });
});

describe("status report exports", () => {
  it("writes the .xlsx: summary sections, results, defects and coverage sheets", async () => {
    const buffer = await buildReportXlsx(buildStatusReport(CLOSED, ctx, t), labels());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Decisión", "Resultados", "Defectos", "Cobertura"]);
    const texts: string[] = [];
    wb.worksheets[0].eachRow((row) => row.eachCell((c) => texts.push(String(c.value))));
    const { metrics, ...summarySections } = labels().sections;
    for (const s of Object.values(summarySections)) expect(texts.join("\n")).toContain(s);
    const decision: string[] = [];
    wb.getWorksheet("Decisión")!.eachRow((row) => row.eachCell((c) => decision.push(String(c.value))));
    expect(decision.join("\n")).toContain(metrics);
    expect(decision[0]).toMatch(/^Go con riesgos · Cerrado el /);
    expect(decision).toContain("Los casos restantes son de facturas, detrás de un flag apagado.");
    // Without a closing there is no decision.
    const open = new ExcelJS.Workbook();
    await open.xlsx.load(await buildReportXlsx(buildStatusReport(SUMMARY, ctx, t), labels()));
    expect(open.worksheets.map((w) => w.name)).toEqual(["Resumen", "Resultados", "Defectos", "Cobertura"]);
    expect(texts).toContain("Repetir TC-002.");
    // TRZ-04: the weighted coverage as two rows with a percentage.
    const resumen = wb.getWorksheet("Resumen")!;
    let weightedRow = 0;
    resumen.eachRow((row, n) => {
      if (row.getCell(1).value === "Cobertura ponderada") weightedRow = n;
    });
    expect(weightedRow).toBeGreaterThan(0);
    expect(resumen.getRow(weightedRow).getCell(2).value).toBe(1);
    expect(resumen.getRow(weightedRow).getCell(2).numFmt).toBe("0.0%");
    expect(resumen.getRow(weightedRow + 1).getCell(1).value).toBe("Aprobada ponderada");
    expect(texts.join("\n")).toContain("Bandas del proyecto: bajo 1–4");
    const results = wb.getWorksheet("Resultados")!;
    expect(results.getRow(1).getCell(1).value).toBe("Caso");
    expect(results.getRow(2).getCell(1).value).toBe("TC-001");
    expect(results.getRow(2).getCell(4).value).toBe("RUN-002");
    expect(wb.getWorksheet("Cobertura")!.getRow(3).getCell(1).value).toBe("REQ-002");
  });

  it("writes the PDF definition with the nine sections", () => {
    const dd = reportDocDefinition(buildStatusReport(CLOSED, ctx, t), labels());
    const text = JSON.stringify(dd.content);
    for (const s of Object.values(labels().sections)) expect(text).toContain(s.replace(/"/g, '\\"'));
    expect(text).toContain("a fecha de hoy");
  });
});

describe("the go/no-go decision (DOC-02)", () => {
  it("records the verdict, each criterion with its justification and the change against the previous cycle", () => {
    const d = buildStatusReport(CLOSED, ctx, t).decision!;
    expect(d.verdictLabel).toBe("Go con riesgos");
    expect(d.summaryLine).toBe("1 de 3 criterios se cumplen. 1 criterio obligatorio no se cumple y tiene su justificación.");
    expect(d.previousLine).toBe("Frente a CYC-006 (Go)");
    expect(d.criteria.rows[0][4]).toBe("Los casos restantes son de facturas, detrás de un flag apagado.");
    expect(d.criteria.rows[1][0]).toBe("Defectos críticos abiertos (orientativo)");
    expect(d.criteria.rows[2][3]).toBe("Cumple");
    expect(d.criteria.rows[2][4]).toBe("Marcado a mano");
    expect(d.criteriaStates).toEqual(["notMet", "notMet", "met"]);
    // Pass rate 50 % against 80 %: worse; time to fix 2 d against 3 d: better.
    const pass = d.metrics.rows.findIndex((r) => r[0] === "Tasa de éxito");
    expect(d.metrics.rows[pass]).toEqual(["Tasa de éxito", "50 %", "80 %", "-30"]);
    expect(d.metricTrend[pass]).toBe(false);
    const fix = d.metrics.rows.findIndex((r) => r[0] === "Tiempo de corrección");
    expect(d.metrics.rows[fix]).toEqual(["Tiempo de corrección", "2 d", "3 d", "-1"]);
    expect(d.metricTrend[fix]).toBe(true);
    expect(buildStatusReport(SUMMARY, ctx, t).decision).toBeNull();
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

describe("pct", () => {
  it("shows a decimal only when there is one (no «0.0 %»)", () => {
    expect([pct(0), pct(1), pct(1 / 3), pct(0.5), pct(null)]).toEqual(["0 %", "100 %", "33,3 %", "50 %", "—"]);
  });

  it("writes the decimal as the language does: a comma in Spanish, a point in English (FIX-43)", () => {
    expect(pct(1 / 3, "es")).toBe("33,3 %");
    expect(pct(1 / 3, "en")).toBe("33.3 %");
  });
});

describe("status report wording (FIX-45)", () => {
  const tr = (k: string, o?: Record<string, unknown>) => i18n.t(k, o);
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("says there is no pass rate yet instead of «de —», and no nested parentheses", () => {
    const text = autoSummary(
      { ...SUMMARY, passRate: null, progressUnit: "cell", progress: { ...SUMMARY.progress, executed: 0, total: 4 } },
      tr,
      "es",
    );
    expect(text).toContain(
      "Se han ejecutado 0 de 4 celdas del ciclo, caso × configuración: 0 %, sin tasa de éxito todavía.",
    );
    expect(text).not.toContain("de —");
    expect(text).not.toContain(") (");
  });

  it("counts the criteria it is given, as a closing does", () => {
    expect(autoSummary(SUMMARY, tr, "es", { met: 2, all: 3 })).toContain("Criterios de salida: 2 de 3 cumplidos.");
  });

  it("lists the runs in key order, numerically", () => {
    expect(runKeyList([{ runKey: "RUN-010" }, { runKey: "RUN-002" }, { runKey: "RUN-009" }])).toBe(
      "RUN-002, RUN-009, RUN-010",
    );
    expect(runKeyList([])).toBe("—");
  });
});
