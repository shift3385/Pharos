import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import i18n from "@shared/i18n";
import { buildPlanXlsx } from "./planXlsx";
import { milestonesTable } from "./planExtras";
import { parsePlanXlsx } from "../import/planImport";
import { defaults, fromInput, toExportable } from "../ui/wizard/formState";

afterEach(() => vi.unstubAllGlobals());

/** The exporter fetches the bundled template; here it is read from disk. */
function serveTemplate(lang: "es" | "en") {
  const file = readFileSync(`src/modules/test-plan/assets/plan-template-${lang}.xlsx`);
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array(file)));
}

describe("plan .xlsx export → import (ADR-0030)", () => {
  it.each(["es", "en"] as const)(
    "keeps catalog deliverables and tools as keys and own entries whole (%s)",
    async (lang) => {
      const t = i18n.getFixedT(lang);
      serveTemplate(lang);
      const form = {
        ...defaults(t),
        deliverables: ["testPlan", "traceabilityMatrix", "Acta de cierre, firmada por QA"],
        tools: ["playwright", "github-actions", "Allure Report"],
      };
      const { buffer } = await buildPlanXlsx(toExportable(form, "Autor", t), lang);
      const { input } = await parsePlanXlsx(buffer, "plan.xlsx", "Autor");
      expect(input.data.deliverables).toEqual(["testPlan", "traceabilityMatrix", "Acta de cierre, firmada por QA"]);
      expect(input.data.tools).toEqual(["playwright", "github-actions", "Allure Report"]);
    },
  );
});

describe("long and multi-line pairs in the .xlsx (UX-15)", () => {
  it("grows the row to fit and keeps the line breaks through export → import", async () => {
    const t = i18n.getFixedT("es");
    serveTemplate("es");
    const risk = "Riesgo largo que ocupa varias líneas en la hoja. ".repeat(5).trim();
    const mitigation = "Primera línea\nSegunda línea";
    const form = { ...defaults(t), risks: [{ risk, mitigation }] };
    const { buffer } = await buildPlanXlsx(toExportable(form, "Autor", t), "es");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    // 245 characters at 50 per line: 5 lines, well over the template's 26.
    expect(wb.worksheets[0].getRow(61).height).toBeGreaterThanOrEqual(5 * 15);

    const { input } = await parsePlanXlsx(buffer, "plan.xlsx", "Autor");
    expect(input.data.risks).toEqual([{ risk, mitigation }]);
  });
});

describe("schedule ids through export → import (RED-W5)", () => {
  it("ids are not exported; the import gives every sprint a fresh unique id", async () => {
    const t = i18n.getFixedT("es");
    serveTemplate("es");
    const form = {
      ...defaults(t),
      sprints: [
        { id: "AAAAAAAA", name: "Sprint 1", start: "2026-11-02", end: "2026-11-15" },
        { id: "BBBBBBBB", name: "Sprint 2", start: "2026-11-16", end: "2026-11-29" },
      ],
    };
    const exportable = toExportable(form, "Autor", t);
    expect(JSON.stringify(exportable)).not.toContain("AAAAAAAA");
    const { buffer } = await buildPlanXlsx(exportable, "es");
    const { input } = await parsePlanXlsx(buffer, "plan.xlsx", "Autor");
    expect(input.data.sprints).toEqual([
      { name: "Sprint 1", start: "2026-11-02", end: "2026-11-15" },
      { name: "Sprint 2", start: "2026-11-16", end: "2026-11-29" },
    ]);
    const imported = fromInput(input, t).sprints;
    expect(new Set(imported.map((s) => s.id)).size).toBe(2);
    expect(imported.map((s) => s.id)).not.toContain("AAAAAAAA");
  });
});

describe("milestones through export → import (FIX-40)", () => {
  it.each(["es", "en"] as const)("come back from their own sheet, equal to the exported ones (%s)", async (lang) => {
    const t = i18n.getFixedT(lang);
    serveTemplate(lang);
    const form = {
      ...defaults(t),
      sprints: [{ id: "AAAAAAAA", name: "Sprint 1", start: "2026-11-09", end: "2026-11-22" }],
      milestones: [
        { id: "CCCCCCCC", name: "Versión candidata", date: "2026-11-27" },
        { id: "DDDDDDDD", name: "Salida a producción", date: "2026-12-06" },
      ],
    };
    const { buffer } = await buildPlanXlsx(
      { ...toExportable(form, "Autor", t), extraTables: [milestonesTable(form.milestones, t)] },
      lang,
      t,
    );
    const { input, rows } = await parsePlanXlsx(buffer, "plan.xlsx", "Autor");
    expect(input.data.milestones).toEqual(form.milestones.map(({ name, date }) => ({ name, date })));
    expect(rows.find((r) => r.labelKey === "testPlan.milestones")).toMatchObject({ status: "filled", count: 2 });
    // Into the form with fresh ids, like the sprints (RED-W5).
    const imported = fromInput(input, t).milestones;
    expect(imported.map(({ name, date }) => ({ name, date }))).toEqual(input.data.milestones);
    expect(imported.map((m) => m.id)).not.toContain("CCCCCCCC");
  });

  it("a file without the milestones sheet brings none and says so", async () => {
    const t = i18n.getFixedT("es");
    serveTemplate("es");
    const { buffer } = await buildPlanXlsx(toExportable(defaults(t), "Autor", t), "es", t);
    const { input, rows } = await parsePlanXlsx(buffer, "plan.xlsx", "Autor");
    expect(input.data.milestones).toBeUndefined();
    expect(rows.find((r) => r.labelKey === "testPlan.milestones")?.status).toBe("notFound");
  });
});

describe("test types and levels through export → import (UX-31)", () => {
  it.each(["es", "en"] as const)(
    "«Confirmación» comes back as `retest`, by the step's groups, with own types whole (%s)",
    async (lang) => {
      const t = i18n.getFixedT(lang);
      serveTemplate(lang);
      const form = {
        ...defaults(t),
        // Ticked in any order: the export follows the step's groups.
        testTypes: ["Pruebas de contrato", "smoke", "retest", "security", "functional"],
        testLevels: ["acceptance", "unit"],
      };
      const exportable = toExportable(form, "Autor", t);
      expect(exportable.testTypes).toEqual(
        lang === "es"
          ? ["Funcionales", "Seguridad", "Confirmación", "Humo", "Pruebas de contrato"]
          : ["Functional", "Security", "Confirmation", "Smoke", "Pruebas de contrato"],
      );
      expect(exportable.testLevels).toEqual(lang === "es" ? ["Unitarias", "Aceptación"] : ["Unit", "Acceptance"]);
      const { buffer } = await buildPlanXlsx(exportable, lang);
      const { input } = await parsePlanXlsx(buffer, "plan.xlsx", "Autor");
      expect(input.data.testTypes).toEqual(["functional", "security", "retest", "smoke", "Pruebas de contrato"]);
      expect(input.data.testLevels).toEqual(["unit", "acceptance"]);
    },
  );
});
