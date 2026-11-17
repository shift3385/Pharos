// The 29119-3 sections (PLN-06), the document ID (PLN-04) and the approval
// (PLN-07) through the .xlsx and the PDF.
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import i18n from "@shared/i18n";
import { buildPlanXlsx } from "./planXlsx";
import { planDocDefinition } from "./planPdf";
import { parsePlanXlsx } from "../import/planImport";
import { defaults, fromInput, toExportable, type FormState } from "../ui/wizard/formState";

afterEach(() => vi.unstubAllGlobals());

function serveTemplate(lang: "es" | "en") {
  const file = readFileSync(`src/modules/test-plan/assets/plan-template-${lang}.xlsx`);
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array(file)));
}

function fullForm(lang: "es" | "en"): FormState {
  const t = i18n.getFixedT(lang);
  const base = defaults(t, "Pharos", { prefix: "PH-", lang });
  const own = { id: "own1", kind: null, name: "Satisfacción del PO", op: ">=" as const, target: 4, unit: "score" as const };
  return {
    ...base,
    documentId: "TP-PH-3F9A1C",
    status: "approved",
    approval: { by: "u1", byName: "Liomar Rodríguez", at: "2026-11-11T10:05:00Z", version: "1.0" },
    assumptions: ["Staging disponible de 8 a 20 h"],
    constraints: ["Dos analistas a media jornada", "Sin datos reales"],
    techniques: ["boundaryValues", "exploratory", "Pruebas de mutación"],
    independence: "team",
    independenceNote: "QA no programa lo que prueba",
    training: [{ need: "Playwright", when: "Antes del sprint 2" }],
    estimation: { technique: "threePoint", optimistic: 12, likely: 18, pessimistic: 30, budget: "9 500 €" },
    entryCriteria: ["Build en staging"],
    suspensionCriteria: ["Falla el login"],
    resumptionCriteria: ["Build con el bloqueo corregido"],
    metrics: [...base.metrics, own],
    closureCriteria: [
      ...base.closureCriteria,
      { criterion: "Satisfacción del PO", metric: "≥ 4", metricId: "own1", blocking: false },
    ],
  };
}

describe("29119-3 sections through the .xlsx (PLN-06)", () => {
  it.each(["es", "en"] as const)("export → import keeps every section, metric and link (%s)", async (lang) => {
    const t = i18n.getFixedT(lang);
    serveTemplate(lang);
    const form = fullForm(lang);
    const { buffer } = await buildPlanXlsx(toExportable(form, "Liomar Rodríguez", t, lang), lang, t);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    expect(ws.getCell("C3").value).toBe("TP-PH-3F9A1C");
    expect(String(ws.getCell("C8").value)).toMatch(/^Liomar Rodríguez · /);
    expect(wb.worksheets.map((w) => w.name).slice(1)).toEqual(
      lang === "es"
        ? ["Estrategia 29119-3", "Métricas", "Criterios de salida"]
        : ["29119-3 strategy", "Metrics", "Exit criteria"],
    );

    const { input } = await parsePlanXlsx(buffer, "plan.xlsx", "Autor");
    const d = input.data;
    expect(d.documentId).toBe("TP-PH-3F9A1C");
    expect(d.assumptions).toEqual(form.assumptions);
    expect(d.constraints).toEqual(form.constraints);
    expect(d.techniques).toEqual(["boundaryValues", "exploratory", "Pruebas de mutación"]);
    expect(d.independence).toBe("team");
    expect(d.independenceNote).toBe(form.independenceNote);
    expect(d.training).toEqual(form.training);
    expect(d.estimation).toEqual({ technique: "threePoint", optimistic: 12, likely: 18, pessimistic: 30, budget: "9 500 €" });
    expect(d.entryCriteria).toEqual(form.entryCriteria);
    expect(d.suspensionCriteria).toEqual(form.suspensionCriteria);
    expect(d.resumptionCriteria).toEqual(form.resumptionCriteria);
    expect(d.metrics?.map((m) => [m.kind, m.name, m.op, m.target, m.unit])).toEqual(
      form.metrics.map((m) => [m.kind, m.name, m.op, m.target, m.unit]),
    );
    // Each criterion is linked to the imported metric of the same name.
    const nameById = new Map(d.metrics!.map((m) => [m.id, m.kind ?? m.name]));
    expect(d.closureCriteria?.map((c) => [c.metricId && nameById.get(c.metricId), c.blocking])).toEqual([
      ["executed", true],
      ["criticalDefects", true],
      ["coverage", true],
      ["Satisfacción del PO", false],
    ]);
    // An approved file comes in «Revisado», to be approved again.
    expect(fromInput(input, t).status).toBe("reviewed");
  });

  it("a plan without the new sections exports no extra sheets", async () => {
    const t = i18n.getFixedT("es");
    serveTemplate("es");
    const form = { ...defaults(t), metrics: [], closureCriteria: [] };
    const { buffer } = await buildPlanXlsx(toExportable(form, "A", t, "es"), "es", t);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets).toHaveLength(1);
    expect(wb.worksheets[0].getCell("C8").value).toBeNull();
  });
});

describe("29119-3 sections in the PDF (PLN-06, PLN-07)", () => {
  it("has the ID, who approved, and each section where the wizard asks for it", () => {
    const t = i18n.getFixedT("es");
    const doc = JSON.stringify(planDocDefinition(toExportable(fullForm("es"), "Liomar Rodríguez", t, "es"), t));
    expect(doc).toContain("ID de documento: TP-PH-3F9A1C");
    expect(doc).toMatch(/Aprobado por: Liomar Rodríguez · /);
    const order = [
      "Fuera del alcance",
      "Supuestos",
      "Restricciones",
      "Tipos de prueba",
      "Técnicas de prueba",
      "Metodología",
      "Independencia de las pruebas",
      "Necesidades de formación",
      "Estimación y presupuesto",
      "Cronograma",
      "Criterios de entrada",
      "Se suspende si…",
      "Se reanuda cuando…",
      "Métricas",
      "Criterios de cierre",
      "Conclusión",
    ].map((title) => doc.indexOf(`"text":"${title}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(doc).toContain("Orientativo");
    expect(doc).toContain("E = (12 + 4·18 + 30) / 6 = 19 persona-días · σ = 3");
  });
});
