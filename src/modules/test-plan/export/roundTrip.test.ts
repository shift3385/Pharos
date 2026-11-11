import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import i18n from "@shared/i18n";
import { buildPlanXlsx } from "./planXlsx";
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
