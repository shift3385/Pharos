import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseCaseXlsx } from "./caseImport";
import { texts } from "../model/steps";

/** Builds a case workbook (main sheet + Gherkin sheet) from cell maps. */
async function book(main: Record<string, string>, gherkin?: string): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Test Case");
  for (const [addr, value] of Object.entries(main)) ws.getCell(addr).value = value;
  const gs = wb.addWorksheet("Gherkin");
  if (gherkin) gs.getCell("B4").value = gherkin;
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const BASIC: Record<string, string> = {
  B3: "TITLE", B4: "Login OK",
  D3: "SCENARIO ID", D4: "ATS_007",
  B5: "MAPPED USE CASE", B6: "UC-1",
  D5: "VERSION", D6: "2.1",
  B7: "DATE", B8: "2026-08-01",
  D7: "PRIORITY", D8: "High",
  B9: "TRACEABILITY (requirement/story ID)", B10: "REQ-1",
  B11: "AUTHOR (first and last name)", B12: "Grace Hopper",
  D11: "STATUS", D12: "Approved",
  B14: "DESCRIPTION", B15: "Logs in with valid credentials.",
  B16: "PRECONDITIONS", B17: "User exists",
  B18: "TEST STEPS", B19: "1. Open login\n2. Submit form",
  B24: "EXPECTED RESULT", B25: "Dashboard shown",
  B26: "POSTCONDITIONS", B27: "Session open",
  B28: "ACCEPTANCE CRITERIA", B29: "No errors",
  B30: "TEST DATA", B31: "user@test.dev",
  B32: "NOTES", // left blank
};

describe("parseCaseXlsx (basic)", () => {
  it("maps header, body and strips step numbering", async () => {
    const buf = await book(BASIC, "Feature: Login\n  Scenario: OK\n    Given a user\n    When login\n    Then dashboard");
    const { input, rows } = await parseCaseXlsx(buf, "Case File.xlsx", "Fallback");

    expect(input.title).toBe("Login OK");
    expect(input.version).toBe("2.1");
    expect(input.priority).toBe("high");
    expect(input.status).toBe("approved");
    expect(input.author).toBe("Grace Hopper");
    expect(input.scenarioId).toBe("ATS_007"); // detected (report only)
    expect(input.data.description).toBe("Logs in with valid credentials.");
    expect(texts(input.data.preconditions)).toEqual(["User exists"]);
    expect(texts(input.data.steps)).toEqual(["Open login", "Submit form"]);
    expect(input.data.expectedResult).toBe("Dashboard shown");
    expect(input.data.testData).toBe("user@test.dev");
    expect(input.data.gherkinLevel).toBe("basic");

    const byKey = (k: string) => rows.find((r) => r.labelKey === k);
    expect(byKey("testCase.notes")?.status).toBe("empty");
    expect(rows.length).toBe(18); // 17 fields + the Gherkin level
  });
});

describe("parseCaseXlsx (advanced)", () => {
  it("reconstructs level and flows from the Gherkin sheet", async () => {
    const gherkin = [
      "Feature: Coupons",
      "  Background:",
      "    Given the store is open",
      "  Scenario: Valid coupon",
      "    Given a valid coupon",
      "    When I apply it",
      "    Then I see the discount",
      "  Scenario: Expired coupon",
      "    Given an expired coupon",
      "    When I apply it",
      "    Then I see an error",
    ].join("\n");
    const buf = await book({ B3: "TITLE", B4: "Coupons", D7: "PRIORITY", D8: "Medium" }, gherkin);
    const { input } = await parseCaseXlsx(buf, "Coupons.xlsx", "Author");

    expect(input.data.gherkinLevel).toBe("advanced");
    expect(input.data.featureSource).toContain("Background");
    expect(texts(input.data.background)).toEqual(
      expect.arrayContaining(["the store is open"]),
    );
    expect(input.data.flows?.map((f) => f.name)).toEqual([
      "Valid coupon",
      "Expired coupon",
    ]);
    // Imported steps and rows get stable ids (DAT-02), unique within the case.
    const ids = (input.data.flows ?? []).flatMap((f) => [
      ...f.steps.map((s) => s.id),
      ...(f.examples?.rows ?? []).map((r) => r.id),
    ]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("parseCaseXlsx (real ES template layout)", () => {
  it("reads values placed in the actual bundled template cells", async () => {
    const wb = new ExcelJS.Workbook();
    const tpl = readFileSync("src/modules/test-cases/assets/case-template-es.xlsx");
    await wb.xlsx.load(tpl as unknown as ArrayBuffer);
    const ws = wb.worksheets.find((w) => w.name !== "Gherkin")!;
    ws.getCell("B4").value = "Aplicar cupón";
    ws.getCell("D4").value = "ATS_014";
    ws.getCell("D6").value = "2.0";
    ws.getCell("D8").value = "Alta";
    ws.getCell("D12").value = "Aprobado";
    ws.getCell("B15").value = "Verifica cupones.";
    ws.getCell("B17").value = "Cupón activo";
    ws.getCell("B19").value = "1. Ir al carrito\n2. Aplicar cupón";
    ws.getCell("B25").value = "Descuento aplicado";
    wb.getWorksheet("Gherkin")!.getCell("B4").value =
      "Feature: Cupón\n  Scenario: Válido\n    Given un cupón válido\n    When lo aplico\n    Then veo el descuento";
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    const { input } = await parseCaseXlsx(buf, "Caso Real.xlsx", "Autor");
    expect(input.title).toBe("Aplicar cupón");
    expect(input.version).toBe("2.0");
    expect(input.priority).toBe("high");
    expect(input.status).toBe("approved");
    expect(texts(input.data.preconditions)).toEqual(["Cupón activo"]);
    expect(texts(input.data.steps)).toEqual(["Ir al carrito", "Aplicar cupón"]);
    expect(input.data.expectedResult).toBe("Descuento aplicado");
    expect(input.data.gherkinLevel).toBe("basic");
  });
});

describe("parseCaseXlsx (Spanish + fallbacks)", () => {
  it("detects Spanish headers and falls back to the file name for the title", async () => {
    const buf = await book({
      D7: "PRIORIDAD", D8: "Crítica",
      D11: "ESTADO", D12: "Aprobado",
      B16: "PRECONDICIONES", B17: "Sesión iniciada",
    });
    const { input, rows } = await parseCaseXlsx(buf, "Mi Caso.xlsx", "Autor");
    expect(input.title).toBe("Mi Caso"); // no TITLE cell → file name
    expect(input.priority).toBe("critical");
    expect(input.status).toBe("approved");
    expect(texts(input.data.preconditions)).toEqual(["Sesión iniciada"]);
    expect(rows.find((r) => r.labelKey === "testCase.fieldTitle")?.status).toBe(
      "notFound",
    );
  });
});
