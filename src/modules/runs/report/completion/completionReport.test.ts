import "@test/slow";
import { beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { CycleClosure, ExecutionSummary } from "@shared/contracts/contract";
import { i18n } from "@test/utils";
import { CLOSED } from "../__fixtures__/summary";
import { buildStatusReport } from "../statusReport";
import {
  EMPTY_TEXTS,
  buildCompletionReport,
  completionDocumentId,
  completionFileName,
  completionLabels,
  draftFor,
  readStored,
  textsDiffer,
  withCompletion,
  type CompletionContext,
} from "./completionReport";
import { completionDocDefinition } from "./completionPdf";
import { buildCompletionXlsx } from "./completionXlsx";

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o);
const S = CLOSED as ExecutionSummary & { closure: CycleClosure };

const ctx = (over: Partial<CompletionContext> = {}): CompletionContext => ({
  projectName: "Portal",
  prefix: "PH-",
  cycle: {
    cycleKey: "CYC-007",
    title: "Regresión 12",
    startsOn: "2026-11-01",
    endsOn: "2026-11-03",
    build: "1.4.2",
    environment: "staging",
  },
  plan: {
    title: "Plan Portal",
    version: "4",
    documentId: "TP-PH-3FA21C",
    approved: true,
    objectives: [
      { kind: "passRate", op: ">=", target: 90 },
      { kind: "fixTime", op: "<=", target: 3 },
    ],
    deliverables: [
      { key: "testPlan", label: "Plan de pruebas" },
      { key: "Informe de rendimiento", label: "Informe de rendimiento" },
    ],
    testData: "Datos anonimizados de producción",
  },
  defects: [
    { id: "d1", defectKey: "DEF-001", title: "Doble cargo", severity: "critical", status: "open", foundInRunId: null },
    { id: "d2", defectKey: "DEF-002", title: "Fecha mal", severity: "minor", status: "open", foundInRunId: "run1" },
    { id: "d3", defectKey: "DEF-003", title: "Ya cerrado", severity: "major", status: "closed", foundInRunId: "run1" },
    { id: "d4", defectKey: "DEF-004", title: "De otro ciclo", severity: "major", status: "open", foundInRunId: "runX" },
  ],
  configurations: ["Chrome · Windows"],
  texts: { ...EMPTY_TEXTS, lessons: "Reservar el sandbox de pagos.", delivered: { "Informe de rendimiento": true } },
  summaryEdited: false,
  approval: null,
  generatedAt: new Date(2026, 10, 6, 9, 0),
  lang: "es",
  ...over,
});

beforeEach(async () => {
  await i18n.changeLanguage("es");
});

describe("completion report model (DOC-01)", () => {
  it("names the document after the plan's rule", () => {
    expect(completionDocumentId("PH-", "CYC-007")).toBe("TCR-PH-CYC-007");
    expect(completionDocumentId("ats_", "CYC-1")).toBe("TCR-ATS-CYC-1");
    expect(completionDocumentId(null, "CYC-1")).toBe("TCR-CYC-1");
    expect(completionFileName("Portal Web", "CYC-007", new Date(2026, 10, 5), "pdf", t)).toBe(
      "Informe_cierre_Portal_Web_CYC-007_2026-11-05.pdf",
    );
  });

  it("builds the eleven sections from the closing, the plan and the defects", () => {
    const r = buildCompletionReport(S, ctx(), t);
    expect(r.documentId).toBe("TCR-PH-CYC-007");
    expect(r.identification[0]).toEqual(["ID del documento", "TCR-PH-CYC-007"]);
    expect(r.identification).toContainEqual(["Plan de pruebas", "Plan Portal · TP-PH-3FA21C · v4 (aprobado)"]);
    // The numbers and the verdict until someone edits the summary.
    expect(r.summary).toMatch(/Se han ejecutado 3 de 4/);
    expect(r.summary).toMatch(/«Go con riesgos»/);
    // Deviations: closed two days after the planned end, one case left, one
    // blocking criterion not met (the manual one was marked as met).
    expect(r.deviations.rows.map((x) => x[3])).toEqual(["+2 días", "1 sin ejecutar", "1 no se cumple, con justificación"]);
    expect(r.deviationTones).toEqual(["warning", "warning", "error"]);
    // The gate's decision, as DOC-02 builds it.
    expect(r.decision.verdict).toBe("goWithRisks");
    expect(r.decision.criteria.rows[0][4]).toBe("Los casos restantes son de facturas, detrás de un flag apagado.");
    expect(r.blockers.rows.map((x) => x[0])).toEqual(["TC-001", "TC-002", "TC-003"]);
    // Measures: the six classic metrics plus the criteria's, with the plan.
    expect(r.measures.headers).toEqual(["Métrica", "CYC-007", "CYC-006", "Cambio", "Objetivo del plan", "¿Lo alcanza?"]);
    const pass = r.measures.rows[0];
    expect(pass[0]).toBe("Tasa de éxito");
    expect(pass[4]).toBe("≥ 90 %");
    expect(pass[5]).toBe("No");
    const fix = r.measures.rows.find((x) => x[0] === "Tiempo de corrección")!;
    expect(fix[5]).toBe("Sí");
    expect(r.measures.rows.find((x) => x[0] === "Flaky")![5]).toBe("Sin objetivo");
    expect(r.measures.rows.map((x) => x[0])).toContain("% de casos ejecutados");
    // Residual risks: open defects of the cycle (found in its runs or on a
    // requirement in scope), worst first; failing requirements by risk.
    expect(r.openDefects.rows.map((x) => x[0])).toEqual(["DEF-001", "DEF-002"]);
    expect(r.riskyRequirements.rows).toEqual([["REQ-002", "Payment", "20", "Alto", "Falla"]]);
    // Deliverables: what Pharos holds, then the plan's, ticked by hand.
    expect(r.deliverableItems.map((d) => [d.label, d.fromPlan, d.delivered])).toEqual([
      ["Plan de pruebas TP-PH-3FA21C v4", false, true],
      ["Ejecuciones RUN-002, RUN-001 (2)", false, true],
      ["1 defecto registrado en el ciclo", false, true],
      ["Informe de cierre TCR-PH-CYC-007", false, true],
      ["Plan de pruebas", true, false],
      ["Informe de rendimiento", true, true],
    ]);
    expect(r.assets).toContainEqual(["Configuraciones", "Chrome · Windows"]);
    expect(r.assets).toContainEqual(["Datos de prueba (según el plan)", "Datos anonimizados de producción"]);
    expect(r.lessons).toBe("Reservar el sandbox de pagos.");
    expect(r.approved).toBe(false);
    expect(r.approvalLine).toBe("Borrador sin aprobar");
  });

  it("works without a plan or a planned end", () => {
    const r = buildCompletionReport(
      S,
      ctx({ plan: null, cycle: { ...ctx().cycle, endsOn: null }, summaryEdited: true, texts: { ...EMPTY_TEXTS, summary: "Mío" } }),
      t,
    );
    expect(r.summary).toBe("Mío");
    expect(r.deviations.rows[0][3]).toBe("Sin fecha de fin planificada");
    expect(r.measures.rows.every((x) => x[4] === "—")).toBe(true);
    expect(r.deliverableItems.some((d) => d.fromPlan)).toBe(false);
  });

  it("shows who approved it and when", () => {
    const r = buildCompletionReport(
      S,
      ctx({ approval: { by: "u1", byName: "Ana Ruiz", at: "2026-11-06T09:10:00.000Z" } }),
      t,
    );
    expect(r.approved).toBe(true);
    expect(r.approvalLine).toMatch(/^Aprobado por Ana Ruiz el /);
  });
});

describe("completion report storage (D2–D4)", () => {
  const closure = { closedAt: "2026-11-05T16:42:00.000Z" };
  const stored = {
    ...EMPTY_TEXTS,
    lessons: "L",
    delivered: { x: true },
    closedAt: closure.closedAt,
    approval: { by: "u1", byName: "Ana", at: "2026-11-06T09:00:00.000Z" },
  };

  it("reads what the cycle stores and ignores what is malformed", () => {
    expect(readStored({})).toBeNull();
    expect(readStored({ completionReport: [] })).toBeNull();
    const r = readStored({ completionReport: { ...stored, delivered: { x: true, y: "no" }, approval: { by: 1 } } });
    expect(r?.lessons).toBe("L");
    expect(r?.delivered).toEqual({ x: true });
    expect(r?.approval).toBeNull();
  });

  it("keeps the texts and the approval of the latest closing", () => {
    const d = draftFor(readStored({ completionReport: stored }), closure);
    expect(d.stale).toBe(false);
    expect(d.approval?.byName).toBe("Ana");
    expect(d.texts.lessons).toBe("L");
  });

  it("after a new closing, keeps the texts but not the approval (D3)", () => {
    const d = draftFor(readStored({ completionReport: stored }), { closedAt: "2026-11-20T10:00:00.000Z" });
    expect(d.stale).toBe(true);
    expect(d.approval).toBeNull();
    expect(d.texts.lessons).toBe("L");
  });

  it("saves into the cycle's data without touching the gate's closings", () => {
    const data = withCompletion({ closures: [{ verdict: "go" }], other: 1 }, stored);
    expect(data.closures).toEqual([{ verdict: "go" }]);
    expect(data.other).toBe(1);
    expect(readStored(data)?.closedAt).toBe(closure.closedAt);
  });

  it("tells when a text or a tick changed (editing takes the approval away)", () => {
    expect(textsDiffer(EMPTY_TEXTS, { ...EMPTY_TEXTS })).toBe(false);
    expect(textsDiffer(EMPTY_TEXTS, { ...EMPTY_TEXTS, lessons: "x" })).toBe(true);
    expect(textsDiffer(EMPTY_TEXTS, { ...EMPTY_TEXTS, delivered: { a: true } })).toBe(true);
    expect(textsDiffer({ ...EMPTY_TEXTS, delivered: { a: false } }, EMPTY_TEXTS)).toBe(false);
  });
});

describe("completion report exports", () => {
  const report = () => buildCompletionReport(S, ctx({ texts: { ...ctx().texts, risks: "Se acepta DEF-002." } }), t);
  const cases = () =>
    buildStatusReport(
      S,
      { projectName: "Portal", scopeLabel: "", periodLabel: "", generatedAt: new Date(), author: "", planTitle: null, lang: "es", summary: "", recommendations: "" },
      t,
    ).cases;

  it("writes the .xlsx with the report, decision, measures, risks, deliverables and cases", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildCompletionXlsx(report(), completionLabels(t), cases()));
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Informe",
      "Decisión",
      "Medidas",
      "Riesgos residuales",
      "Entregables",
      "Casos",
    ]);
    const texts: string[] = [];
    wb.worksheets[0].eachRow((row) => row.eachCell((c) => texts.push(String(c.value))));
    for (const s of Object.values(completionLabels(t).sections)) expect(texts).toContain(s);
    expect(texts).toContain("Se acepta DEF-002.");
    expect(texts).toContain("Reservar el sandbox de pagos.");
    expect(texts).toContain("Borrador sin aprobar");
    expect(wb.getWorksheet("Medidas")!.getRow(1).getCell(5).value).toBe("Objetivo del plan");
    expect(wb.getWorksheet("Riesgos residuales")!.getRow(3).getCell(1).value).toBe("DEF-001");
    expect(wb.getWorksheet("Casos")!.getRow(2).getCell(1).value).toBe("TC-001");
  });

  it("writes the PDF definition with the eleven sections", () => {
    const text = JSON.stringify(completionDocDefinition(report(), completionLabels(t)).content);
    for (const s of Object.values(completionLabels(t).sections)) expect(text).toContain(s);
    expect(text).toContain("TCR-PH-CYC-007");
    expect(text).toContain("Go con riesgos");
    expect(text).toContain("Se acepta DEF-002.");
  });
});
