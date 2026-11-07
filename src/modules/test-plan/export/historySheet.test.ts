// PLN-02: the «Historial de revisiones» in the plan export. Without it the
// files are as before; with it, the .xlsx gets a sheet right after the
// template's (which stays as it is, and which the import reads) and the PDF a
// section right after its header.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import i18n from "@shared/i18n";
import { buildPlanXlsx } from "./planXlsx";
import { planDocDefinition } from "./planPdf";
import { milestonesTable } from "./planExtras";
import { groupHistory, historyTable, planSaves } from "./planHistory";
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

const t = i18n.getFixedT("es");
const table = () =>
  historyTable(
    groupHistory(
      planSaves(
        {
          createdAt: "2026-11-05T09:00:00.000Z",
          createdBy: "u1",
          revisions: [],
          events: [
            {
              at: "2026-11-05T09:00:00.000Z",
              actor: "user:u1",
              action: "create",
              changes: { version: [null, "1.0"], status: [null, "draft"] },
            },
            {
              at: "2026-11-06T21:03:00.000Z",
              actor: "user:u1",
              action: "update",
              changes: {
                version: ["1.0", "1.1"],
                status: ["draft", "approved"],
                "data.sprints": [[], [{}]],
                "data.roles": [[], [{}]],
              },
            },
          ],
        },
        { title: "Checkout", data: {} },
      ),
      "UTC",
    ),
    { names: { u1: "Test Smoke" } },
    t,
    "UTC",
  );

async function load(buffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}
const cells = (ws: ExcelJS.Worksheet) => {
  const out: unknown[] = [];
  ws.eachRow({ includeEmpty: true }, (row) => out.push(row.values));
  return JSON.stringify(out);
};
const values = (ws: ExcelJS.Worksheet, n: number) =>
  (ws.getRow(n).values as unknown[]).slice(1);

describe("plan export: «Historial de revisiones» (PLN-02)", () => {
  it("the .xlsx has the history sheet only when asked, after the template's, and imports the same", async () => {
    serve();
    const form = {
      ...defaults(t),
      title: "Checkout",
      milestones: [{ id: "M1", name: "Entrega beta", date: "2026-11-20" }],
    };
    const plain = {
      ...toExportable(form, "Ada", t),
      extraTables: [milestonesTable(form.milestones, t)],
    };
    const without = await load((await buildPlanXlsx(plain, "es")).buffer);
    expect(without.worksheets.map((w) => w.name)).not.toContain(
      "Historial de revisiones",
    );

    const { buffer } = await buildPlanXlsx(
      { ...plain, history: table() },
      "es",
    );
    const withHistory = await load(buffer);
    expect(withHistory.worksheets.map((w) => w.name)).toEqual([
      without.worksheets[0].name,
      "Historial de revisiones",
      ...without.worksheets.slice(1).map((w) => w.name),
    ]);
    expect(cells(withHistory.worksheets[0])).toBe(cells(without.worksheets[0]));
    const sheet = withHistory.getWorksheet("Historial de revisiones")!;
    expect(values(sheet, 1)).toEqual([
      "Versión",
      "Fecha",
      "Revisado por",
      "Estado",
      "Cambios",
    ]);
    expect(values(sheet, 2)).toEqual([
      "1.0",
      "2026-11-05 09:00",
      "Test Smoke",
      "Borrador",
      "Creación del plan",
    ]);
    // The newest revision is the bottom row.
    expect(values(sheet, 3)).toEqual([
      "1.1",
      "2026-11-06 21:03",
      "Test Smoke",
      "Aprobado",
      "Roles y responsabilidades, Cronograma · Aprobado",
    ]);

    const imported = await parsePlanXlsx(buffer, "plan.xlsx", "Ada");
    const reference = await parsePlanXlsx(
      (await buildPlanXlsx(plain, "es")).buffer,
      "plan.xlsx",
      "Ada",
    );
    expect(imported.input).toEqual(reference.input);
  });

  it("the PDF has the history right after the header only when asked", () => {
    const base = toExportable({ ...defaults(t), title: "Checkout" }, "Ada", t);
    const plain = JSON.stringify(planDocDefinition(base, t));
    expect(plain).not.toContain("Historial de revisiones");
    const pdf = JSON.stringify(
      planDocDefinition({ ...base, history: table() }, t),
    );
    const at = pdf.indexOf("Historial de revisiones");
    expect(at).toBeGreaterThan(pdf.indexOf("Autor"));
    expect(at).toBeLessThan(pdf.indexOf("Resumen"));
    expect(pdf).toContain("Test Smoke");
    expect(pdf).toContain("Roles y responsabilidades, Cronograma · Aprobado");
  });
});
