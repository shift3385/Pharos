import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parsePlanXlsx } from "./planImport";

/** Builds an in-memory plan sheet from a {cell: value} map and returns its buffer. */
async function sheet(cells: Record<string, string>): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Test Plan");
  for (const [addr, value] of Object.entries(cells)) ws.getCell(addr).value = value;
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const EN: Record<string, string> = {
  B1: "PHAROS",
  B4: "Version", C4: "2.1",
  B5: "Date", C5: "2026-08-01",
  B6: "Author (first and last name)", C6: "Ada Lovelace",
  B7: "Status", C7: "Approved",
  B10: "Summary", B11: "Overall summary.",
  B12: "Purpose", B13: "The purpose.",
  B15: "In-scope items", B16: "Login\nCheckout",
  B17: "Out of scope", // left blank on purpose
  B20: "Test types", B21: "Functional\nPerformance",
  B22: "Agile methodology (sprints, ceremonies, retrospective)",
  B23: "Agile · Sprint length (weeks): 2 · Team meetings: Daily, Retrospective",
  B24: "Test levels", B25: "System\nAcceptance",
  B26: "Test deliverables", B27: "Test report",
  B29: "Configuration", B30: "Staging",
  B31: "Hardware and software requirements", B32: "8GB RAM",
  // "Data approach" (testDataManagement) intentionally omitted → notFound
  B34: "Test tools", B35: "Playwright\nJIRA",
  B36: "Automation strategy", B37: "Page objects.",
  B44: "Reporting process", B45: "Via Jira.",
  B65: "Channels", B66: "Daily sync.",
  B76: "13. Conclusion", B77: "Ready.",
  // Tables
  B49: "ROLE", C49: "RESPONSIBILITIES", B50: "QA Lead", C50: "Owns the plan",
  B55: "ACTIVITY", E55: "DATE", B56: "Sprint 1", E56: "2026-08-01 → 2026-08-14",
  B60: "POTENTIAL RISK", D60: "MITIGATION STRATEGY", B61: "Flaky env", D61: "Retries",
  B72: "CRITERION", D72: "SUCCESS METRIC", B73: "95% executed", D73: ">= 95%",
};

describe("parsePlanXlsx (English template)", () => {
  it("maps header, sections, catalogs, methodology and tables", async () => {
    const buf = await sheet(EN);
    const { input } = await parsePlanXlsx(buf, "My Plan.xlsx", "Fallback Author");

    expect(input.title).toBe("My Plan");
    expect(input.version).toBe("2.1");
    expect(input.planDate).toBe("2026-08-01");
    expect(input.author).toBe("Ada Lovelace"); // cell overrides the fallback
    expect(input.status).toBe("approved");

    expect(input.data.summary).toBe("Overall summary.");
    expect(input.data.scopeIn).toEqual(["Login", "Checkout"]);
    expect(input.data.testTypes).toEqual(["functional", "performance"]);
    expect(input.data.testLevels).toEqual(["system", "acceptance"]);
    expect(input.data.tools).toEqual(["playwright", "jira"]);

    expect(input.data.methodologyType).toBe("agile");
    expect(input.data.sprintWeeks).toBe(2);
    expect(input.data.ceremonies).toEqual(expect.arrayContaining(["daily", "retrospective"]));

    expect(input.data.roles).toEqual([{ role: "QA Lead", responsibility: "Owns the plan" }]);
    expect(input.data.sprints).toEqual([
      { name: "Sprint 1", start: "2026-08-01", end: "2026-08-14" },
    ]);
    expect(input.data.risks).toEqual([{ risk: "Flaky env", mitigation: "Retries" }]);
    expect(input.data.closureCriteria).toEqual([{ criterion: "95% executed", metric: ">= 95%" }]);
  });

  it("reports blanks and undetected fields", async () => {
    const buf = await sheet(EN);
    const { rows } = await parsePlanXlsx(buf, "My Plan.xlsx", "Fallback");

    const byKey = (k: string) => rows.find((r) => r.labelKey === k);
    expect(byKey("testPlan.scopeOut")?.status).toBe("empty");
    expect(byKey("testPlan.testDataManagement")?.status).toBe("notFound");
    expect(byKey("testPlan.summary")?.status).toBe("filled");
    expect(byKey("testPlan.step.roles")?.count).toBe(1);
    // one row per field + table + the title
    expect(rows.length).toBe(25);
  });

  it("emits progress for every detected item", async () => {
    const buf = await sheet(EN);
    let last = 0;
    let total = 0;
    await parsePlanXlsx(buf, "My Plan.xlsx", "Fallback", (p) => {
      last = p.done;
      total = p.total;
    });
    expect(total).toBe(25);
    expect(last).toBe(25);
  });
});

describe("parsePlanXlsx (real ES template layout)", () => {
  it("reads values placed in the actual bundled template cells", async () => {
    const wb = new ExcelJS.Workbook();
    const tpl = readFileSync("src/modules/test-plan/assets/plan-template-es.xlsx");
    await wb.xlsx.load(tpl as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    // Fill value cells exactly where the exporter writes them.
    ws.getCell("C4").value = "3.0";
    ws.getCell("C7").value = "Aprobado";
    ws.getCell("B11").value = "Mi resumen.";
    ws.getCell("B21").value = "Funcionales\nSeguridad";
    ws.getCell("B25").value = "Sistema";
    ws.getCell("B35").value = "Cypress\nPostman";
    ws.getCell("B50").value = "Líder QA";
    ws.getCell("C50").value = "Responsable del plan";
    ws.getCell("B56").value = "Sprint A";
    ws.getCell("E56").value = "2026-09-01 → 2026-09-15";
    ws.getCell("B61").value = "Riesgo X";
    ws.getCell("D61").value = "Mitigación X";
    ws.getCell("B73").value = "Cobertura";
    ws.getCell("D73").value = ">= 90%";
    ws.getCell("B77").value = "Listo para liberar.";
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    const { input } = await parsePlanXlsx(buf, "Plan Real.xlsx", "Autor");
    expect(input.version).toBe("3.0");
    expect(input.status).toBe("approved");
    expect(input.data.summary).toBe("Mi resumen.");
    expect(input.data.testTypes).toEqual(["functional", "security"]);
    expect(input.data.testLevels).toEqual(["system"]);
    expect(input.data.tools).toEqual(["cypress", "postman"]);
    expect(input.data.conclusion).toBe("Listo para liberar.");
    expect(input.data.roles).toContainEqual({ role: "Líder QA", responsibility: "Responsable del plan" });
    expect(input.data.sprints).toContainEqual({ name: "Sprint A", start: "2026-09-01", end: "2026-09-15" });
    expect(input.data.risks).toContainEqual({ risk: "Riesgo X", mitigation: "Mitigación X" });
    expect(input.data.closureCriteria).toContainEqual({ criterion: "Cobertura", metric: ">= 90%" });
  });
});

describe("parsePlanXlsx (Spanish template)", () => {
  it("detects Spanish headers, status and methodology", async () => {
    const buf = await sheet({
      B1: "PHAROS",
      B7: "Estado", C7: "Aprobado",
      B10: "Resumen", B11: "Resumen general.",
      B22: "Metodología ágil (sprints, ceremonias, retrospectiva)",
      B23: "Ágil · Duración de sprint (semanas): 3 · Reuniones del equipo: Diaria",
      B48: "8. Roles y Responsabilidades",
      B49: "ROL", C49: "RESPONSABILIDADES", B50: "Líder QA", C50: "Dueña del plan",
    });
    const { input } = await parsePlanXlsx(buf, "Mi Plan.xlsx", "Autor");
    expect(input.status).toBe("approved");
    expect(input.data.summary).toBe("Resumen general.");
    expect(input.data.methodologyType).toBe("agile");
    expect(input.data.sprintWeeks).toBe(3);
    expect(input.data.ceremonies).toContain("daily");
    expect(input.data.roles).toEqual([{ role: "Líder QA", responsibility: "Dueña del plan" }]);
  });
});
