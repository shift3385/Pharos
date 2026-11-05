// EXP-03: the «Ciclos» sheet of a case export: only the cycles the case is
// in, after the other sheets (which stay as they are); the importer ignores it.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@shared/i18n";
import { caseCyclesTable, type CycleExportData } from "@modules/cycles";
import type { TestCase } from "../model/types";
import { parseCaseXlsx } from "../import/caseImport";
import { caseToExportable } from "./batch";
import { buildCaseXlsx } from "./caseXlsx";

const ROOT = resolve(__dirname, "../../../..");
afterEach(() => vi.unstubAllGlobals());
const serve = () =>
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(readFileSync(join(ROOT, url.replace(/^\//, "")))),
  );

const progress = {
  total: 4,
  executed: 3,
  passed: 2,
  failed: 1,
  blocked: 0,
  skipped: 0,
  other: 0,
  notRun: 1,
};
const data: CycleExportData = {
  cycles: [
    {
      id: "cy1",
      projectId: "p",
      cycleKey: "CYC-001",
      title: "Regresión 1.4",
      description: "",
      testPlanId: null,
      milestone: "Beta",
      sprint: "S2",
      build: "1.4.0",
      environment: "staging",
      configurationIds: ["k1", "gone"],
      startsOn: "2026-11-02",
      endsOn: "2026-11-06",
      status: "active",
      data: {},
      createdAt: "",
      updatedAt: "",
      revision: 1,
      items: 2,
      runs: 1,
      progress,
    },
  ],
  configurations: [
    {
      id: "k1",
      projectId: "p",
      name: "Chrome",
      attributes: {},
      matchLabels: [],
      position: 0,
      archivedAt: null,
      createdAt: "",
      updatedAt: "",
      revision: 1,
    } as unknown as CycleExportData["configurations"][number],
  ],
  items: new Map([
    [
      "cy1",
      [
        {
          id: "i1",
          cycleId: "cy1",
          testCaseId: "c",
          caseKey: "ATS_001",
          caseTitle: "",
          caseStatus: "",
          casePriority: "",
          flowId: null,
          exampleRowId: null,
          assignee: "Ada",
          position: 0,
          revision: 1,
        },
        {
          id: "i2",
          cycleId: "cy1",
          testCaseId: "other",
          caseKey: "ATS_002",
          caseTitle: "",
          caseStatus: "",
          casePriority: "",
          flowId: null,
          exampleRowId: null,
          assignee: null,
          position: 1,
          revision: 1,
        },
      ],
    ],
  ]),
};

async function sheets(buffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}
const cells = (ws: ExcelJS.Worksheet) => {
  const out: unknown[] = [];
  ws.eachRow({ includeEmpty: true }, (row) => out.push(row.values));
  return JSON.stringify(out);
};

describe("case export: «Ciclos» (EXP-03)", () => {
  const asCase: TestCase = {
    id: "c",
    workspaceId: "ws",
    projectId: "p",
    scenarioId: "ATS_001",
    title: "Pago",
    version: "1.0",
    status: "draft",
    priority: "medium",
    caseType: null,
    automationStatus: null,
    author: "QA",
    data: { steps: [{ id: "s1", text: "Abrir" }], expectedResult: "Ok" },
    createdAt: "",
    updatedAt: "",
    revision: 1,
  } as TestCase;

  it("lists only the cycles the case is in, after the other sheets; the import ignores it", async () => {
    const t = i18n.getFixedT("es");
    serve();
    const plain = caseToExportable(asCase, t);
    const table = caseCyclesTable("c", data, t, "es");
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toEqual(
      expect.arrayContaining(["CYC-001", "Activo", "Caso entero", "Ada"]),
    );
    expect(caseCyclesTable("nowhere", data, t).rows).toEqual([]);

    const before = await sheets((await buildCaseXlsx(plain, "es")).buffer);
    const { buffer } = await buildCaseXlsx(
      { ...plain, extraTables: [table] },
      "es",
    );
    const after = await sheets(buffer);
    expect(after.worksheets.map((w) => w.name)).toEqual([
      ...before.worksheets.map((w) => w.name),
      "Ciclos",
    ]);
    before.worksheets.forEach((w, i) =>
      expect(cells(after.worksheets[i])).toBe(cells(w)),
    );

    const a = await parseCaseXlsx(buffer, "ATS_001.xlsx", "QA");
    const b = await parseCaseXlsx(
      (await buildCaseXlsx(plain, "es")).buffer,
      "ATS_001.xlsx",
      "QA",
    );
    // An import mints new step ids; everything else must match.
    const noIds = (v: unknown) =>
      JSON.stringify(v, (k, x) => (k === "id" ? undefined : x));
    expect(noIds(a.input.data)).toBe(noIds(b.input.data));
    expect(a.input.title).toBe(b.input.title);
  });
});
