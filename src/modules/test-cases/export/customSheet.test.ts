// The «Campos personalizados» sheet (FLD-01, ADR-0018 decision 2): only when
// the case has something to say, after the template's sheets (which stay
// as they are), and read back by the import against the project's fields.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomField } from "@modules/custom-fields";
import type { TestCase } from "../model/types";
import { parseCaseXlsx, withCustomSheet } from "../import/caseImport";
import { caseToExportable, projectFeatureFiles } from "./batch";
import { buildCaseXlsx } from "./caseXlsx";
import { AUTOMATION_KEY, CASE_TYPE_KEY } from "./customSheet";
import { testCaseApi } from "../api/testCaseApi";

const ROOT = resolve(__dirname, "../../../..");
const es = JSON.parse(
  readFileSync(join(ROOT, "src/shared/i18n/locales/es.json"), "utf8"),
);
/** The Spanish strings, as the app shows them. */
const t = (key: string) =>
  String(
    key
      .split(".")
      .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], es) ??
      key,
  );

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(readFileSync(join(ROOT, url.replace(/^\//, "")))),
  );
});

const field = (over: Partial<CustomField>): CustomField => ({
  id: over.fieldKey ?? "f",
  projectId: "p",
  entity: "test_case",
  fieldKey: "f",
  label: "F",
  description: "",
  fieldType: "text",
  options: [],
  required: false,
  defaultValue: null,
  appliesToCaseTypes: null,
  position: 0,
  archivedAt: null,
  createdAt: "",
  updatedAt: "",
  revision: 1,
  ...over,
});
const FIELDS = [
  field({
    fieldKey: "browser",
    label: "Navegador",
    fieldType: "multi_select",
    options: [
      { id: "OPT00001", label: "Chrome", archived: false },
      { id: "OPT00002", label: "Firefox", archived: false },
    ],
  }),
  field({
    fieldKey: "points",
    label: "Puntos",
    fieldType: "integer",
    position: 1,
  }),
  field({
    fieldKey: "signed",
    label: "Firmado",
    fieldType: "boolean",
    position: 2,
  }),
];

const asCase = (over: Partial<TestCase>): TestCase => ({
  id: "c",
  workspaceId: "ws",
  projectId: "p",
  scenarioId: "ATS_009",
  title: "Pago",
  version: "1.0",
  status: "draft",
  priority: "medium",
  caseType: null,
  automationStatus: null,
  author: "QA",
  data: { gherkinLevel: "basic", steps: [{ id: "A0000001", text: "pagar" }] },
  createdAt: "",
  updatedAt: "",
  revision: 1,
  ...over,
});

async function sheets(c: TestCase) {
  const { buffer } = await buildCaseXlsx(caseToExportable(c, t, FIELDS), "es");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return { buffer, names: wb.worksheets.map((w) => w.name), wb };
}

describe("export", () => {
  it("a case with the defaults and no values has no extra sheet", async () => {
    const { names } = await sheets(asCase({}));
    expect(names).not.toContain("Campos personalizados");
  });

  it("a checklist with values gets the sheet after the template's", async () => {
    const { names, wb } = await sheets(
      asCase({
        caseType: "checklist",
        automationStatus: "to_automate",
        data: {
          custom: {
            browser: ["OPT00002", "OPT00001"],
            signed: true,
            unknown_key: "x",
          },
        },
      }),
    );
    expect(names[names.length - 1]).toBe("Campos personalizados");
    const ws = wb.getWorksheet("Campos personalizados")!;
    const rows = ws
      .getSheetValues()
      .slice(1)
      .map((r) => (r as unknown[]).slice(1));
    expect(rows).toEqual([
      ["Campo", "Clave", "Valor"],
      ["Tipo de caso", CASE_TYPE_KEY, "Checklist"],
      ["Automatización", AUTOMATION_KEY, "Por automatizar"],
      ["Navegador", "browser", "Firefox; Chrome"],
      ["Firmado", "signed", "Sí"],
      ["unknown_key", "unknown_key", "x"],
    ]);
  });
});

describe("import", () => {
  it("reads the sheet back against the project's fields", async () => {
    const { buffer } = await sheets(
      asCase({
        caseType: "checklist",
        automationStatus: "automated",
        data: {
          custom: {
            browser: ["OPT00001"],
            points: 8,
            signed: false,
            unknown_key: "x",
          },
        },
      }),
    );
    const { input, rows } = await parseCaseXlsx(buffer, "c.xlsx", "QA");
    expect(
      rows.some(
        (r) => r.labelKey === "testCase.exportSheet" && r.status === "filled",
      ),
    ).toBe(true);
    const applied = withCustomSheet(input, FIELDS, { yes: "Sí", no: "No" });
    expect(applied.skipped).toEqual([]);
    expect(applied.input).toMatchObject({
      caseType: "checklist",
      automationStatus: "automated",
    });
    expect(applied.input.data.custom).toEqual({
      browser: ["OPT00001"],
      points: 8,
      signed: false,
      unknown_key: "x",
    });
  });

  it("a value that does not fit its field is left out and named", async () => {
    const { buffer } = await sheets(
      asCase({ data: { custom: { points: 8 } } }),
    );
    const { input } = await parseCaseXlsx(buffer, "c.xlsx", "QA");
    // In this project «points» is a yes/no field: "8" does not fit.
    const applied = withCustomSheet(
      input,
      [field({ fieldKey: "points", fieldType: "boolean" })],
      { yes: "Sí", no: "No" },
    );
    expect(applied.skipped).toEqual(["points"]);
    expect(applied.input.data.custom).toEqual({});
  });
});

describe(".feature batch", () => {
  it("leaves checklists out and counts them", async () => {
    const summary = (
      id: string,
      caseType: "standard" | "checklist" | null,
    ) => ({
      id,
      scenarioId: id,
      title: id,
      status: "draft",
      priority: "medium",
      gherkinLevel: "basic" as const,
      caseType,
      automationStatus: null,
      custom: {},
      updatedAt: "",
      revision: 1,
    });
    vi.spyOn(testCaseApi, "list").mockResolvedValue([
      summary("A", null),
      summary("B", "checklist"),
    ]);
    vi.spyOn(testCaseApi, "get").mockImplementation(async (id) =>
      asCase({ id, scenarioId: id }),
    );
    let skipped = 0;
    const files = await projectFeatureFiles(
      "p",
      "u",
      t,
      undefined,
      () => skipped++,
    );
    expect(files.map((f) => f.name)).toEqual(["A.feature"]);
    expect(skipped).toBe(1);
  });
});
