// EXP-03: milestones and cycles in the plan export. The template's sheet
// stays as it is (same cells with and without the new sheets), the new ones
// come after it, and the importer ignores them. The case side is in
// test-cases/export/cycleSheet.test.ts.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@shared/i18n";
import { cyclesTable, type CycleExportData } from "@modules/cycles";
import { buildPlanXlsx } from "./planXlsx";
import { planDocDefinition } from "./planPdf";
import { milestonesTable } from "./planExtras";
import { parsePlanXlsx } from "../import/planImport";
import { defaults, toExportable } from "../ui/wizard/formState";

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

describe("plan export: «Hitos» and «Ciclos» (EXP-03)", () => {
  it("adds both sheets after the template's, which does not change, and the import ignores them", async () => {
    const t = i18n.getFixedT("es");
    serve();
    const form = {
      ...defaults(t),
      title: "Checkout",
      milestones: [
        { id: "M1", name: "Entrega beta", date: "2026-11-20" },
        { id: "M2", name: "", date: "" },
      ],
    };
    const plain = toExportable(form, "Ada", t);
    const extra = {
      ...plain,
      extraTables: [
        milestonesTable(form.milestones, t),
        cyclesTable(data, t, "es"),
      ],
    };
    const before = await sheets((await buildPlanXlsx(plain, "es")).buffer);
    const { buffer } = await buildPlanXlsx(extra, "es");
    const after = await sheets(buffer);
    expect(after.worksheets.map((w) => w.name)).toEqual([
      ...before.worksheets.map((w) => w.name),
      "Hitos",
      "Ciclos",
    ]);
    expect(cells(after.worksheets[0])).toBe(cells(before.worksheets[0]));

    const hitos = after.getWorksheet("Hitos")!;
    expect((hitos.getRow(1).values as unknown[]).slice(1)).toEqual([
      "Hito",
      "Fecha",
    ]);
    expect(hitos.rowCount).toBe(2);
    expect((hitos.getRow(2).values as unknown[]).slice(1)).toEqual([
      "Entrega beta",
      "2026-11-20",
    ]);

    const ciclos = after.getWorksheet("Ciclos")!;
    const head = ciclos.getRow(1).values as unknown[];
    const row = ciclos.getRow(2).values as unknown[];
    const col = (name: string) => row[head.indexOf(name)];
    expect(col("Clave")).toBe("CYC-001");
    expect(col("Estado")).toBe("Activo");
    expect(col("Configuraciones")).toBe("Chrome, Configuración eliminada");
    // The list's summary and the screen's percents (floor of executed/total).
    expect([
      col("Celdas"),
      col("Ejecutadas"),
      col("Pasan"),
      col("Fallan"),
      col("Sin ejecutar"),
    ]).toEqual([4, 3, 2, 1, 1]);
    expect([col("% ejecutado"), col("% pasa")]).toEqual([75, 50]);

    const imported = await parsePlanXlsx(buffer, "plan.xlsx", "Ada");
    const reference = await parsePlanXlsx(
      (await buildPlanXlsx(plain, "es")).buffer,
      "plan.xlsx",
      "Ada",
    );
    expect(imported.input).toEqual(reference.input);
  });

  it("the PDF ends with the same tables; an empty one adds nothing", () => {
    const t = i18n.getFixedT("es");
    const base = toExportable({ ...defaults(t), title: "Checkout" }, "Ada", t);
    const plainPdf = JSON.stringify(planDocDefinition(base, t));
    const withEmpty = JSON.stringify(
      planDocDefinition(
        {
          ...base,
          extraTables: [
            milestonesTable([], t),
            cyclesTable({ ...data, cycles: [] }, t),
          ],
        },
        t,
      ),
    );
    expect(withEmpty).toBe(plainPdf);
    const pdf = JSON.stringify(
      planDocDefinition(
        { ...base, extraTables: [cyclesTable(data, t, "es")] },
        t,
      ),
    );
    expect(
      pdf.startsWith(plainPdf.slice(0, plainPdf.indexOf("Conclusión"))),
    ).toBe(true);
    expect(pdf).toContain("3/4 · 50 %");
    expect(pdf).toContain("Beta · S2");
  });
});
