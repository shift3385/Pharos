import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { milestonesTable } from "./planExtras";
import { planDocDefinition } from "./planPdf";
import type { ExportablePlan } from "./planXlsx";

const t = (k: string) => k; // identity translator: labels render as their keys

const sample: ExportablePlan = {
  filenameBase: "Checkout Plan",
  version: "1.2",
  planDate: "2026-08-01",
  author: "Ada Lovelace",
  status: "Approved",
  summary: "Overall summary text.",
  purpose: "The purpose.",
  scopeIn: ["Login", "Checkout"],
  scopeOut: ["Legacy admin"],
  testTypes: ["Functional", "Performance"],
  methodology: "Agile · sprint 2w",
  testLevels: ["System", "Acceptance"],
  deliverables: ["Test report"],
  environmentConfig: "Staging",
  environmentRequirements: "8GB RAM",
  tools: ["Playwright"],
  automationStrategy: "Page objects.",
  testDataManagement: "Synthetic data.",
  defectManagement: "Jira.",
  communicationPlan: "Daily sync.",
  conclusion: "Ready.",
  roles: [{ role: "QA Lead", responsibility: "Owns the plan" }],
  sprints: [{ name: "Sprint 1", range: "2026-08-01 → 2026-08-14" }],
  risks: [{ risk: "Flaky env", mitigation: "Retries" }],
  closureCriteria: [{ criterion: "95% executed", metric: ">= 95%" }],
};

describe("planDocDefinition", () => {
  it("produces a document with header, footer and content", () => {
    const dd = planDocDefinition(sample, t);
    expect(typeof dd.header).toBe("function");
    expect(typeof dd.footer).toBe("function");
    expect(Array.isArray(dd.content)).toBe(true);
    expect(dd.styles).toHaveProperty("sectionBar");
  });

  it("includes the title, meta and all table data", () => {
    const json = JSON.stringify(planDocDefinition(sample, t));
    // title + scalar fields
    for (const s of ["Checkout Plan", "1.2", "Ada Lovelace", "Overall summary text.", "Agile · sprint 2w"]) {
      expect(json).toContain(s);
    }
    // list items and table cells
    for (const s of ["Checkout", "QA Lead", "Owns the plan", "Sprint 1", "Flaky env", "95% executed"]) {
      expect(json).toContain(s);
    }
  });

  it("uses the translated document kind in the header", () => {
    const dd = planDocDefinition(sample, (k) => (k === "testPlan.pdfKind" ? "Test Plan" : k));
    const header = (dd.header as (p: number, c: number) => unknown)(1, 1);
    expect(JSON.stringify(header)).toContain("Test Plan");
  });

  it("prints the methodology one entry per line when it has the lines (PLN-05)", () => {
    const dd = planDocDefinition(
      { ...sample, methodologyLines: ["Ágil", "Duración de sprint: 2 semanas", "Reuniones del equipo: Diaria"] },
      t,
    );
    const json = JSON.stringify(dd.content);
    expect(json).toContain(JSON.stringify({ stack: [
      { text: "Ágil", style: "value" },
      { text: "Duración de sprint: 2 semanas", style: "value" },
      { text: "Reuniones del equipo: Diaria", style: "value" },
    ], margin: [0, 0, 0, 2], unbreakable: true }));
    expect(json).not.toContain("Agile · sprint 2w");
  });

  it("separates the dates of a range with a dash the font has (PLN-05)", () => {
    const json = JSON.stringify(planDocDefinition(sample, t).content);
    expect(json).toContain("2026-08-01 – 2026-08-14");
    expect(json).not.toContain("→");
  });

  it("only uses characters the bundled Roboto can print (PLN-05)", async () => {
    // pdfmake's own fonts and font reader (a dependency of pdfmake).
    const require = createRequire(import.meta.url);
    const fontkit = require("@foliojs-fork/fontkit") as {
      create: (b: Buffer) => { hasGlyphForCodePoint: (c: number) => boolean };
    };
    const mod = (await import("pdfmake/build/vfs_fonts")) as Record<string, unknown>;
    const holder = (mod.default ?? mod) as Record<string, unknown>;
    const vfs = ((holder.pdfMake as { vfs?: Record<string, string> } | undefined)?.vfs ??
      holder.vfs ??
      holder) as Record<string, string>;
    const font = fontkit.create(Buffer.from(vfs["Roboto-Regular.ttf"], "base64"));
    const dd = planDocDefinition(
      { ...sample, methodologyLines: ["Ágil", "Revisión: 1 vez por sprint"], summary: "«Banca Móvil» – ñ ≥ 95 % … ✓" },
      t,
    );
    const texts: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === "string") texts.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object")
        for (const [k, x] of Object.entries(v)) if (k !== "svg") walk(x);
    };
    walk(dd.content);
    walk((dd.header as (p: number, c: number) => unknown)(1, 1));
    const missing = [...new Set(texts.join(""))].filter(
      (ch) => ch.trim() && !font.hasGlyphForCodePoint(ch.codePointAt(0) ?? 0),
    );
    expect(missing).toEqual([]);
  });

  it("prints the milestones under the schedule and the cycles at the end (PLN-05)", () => {
    const dd = planDocDefinition(
      {
        ...sample,
        extraTables: [
          milestonesTable([{ name: "Go-live", date: "2026-09-01" }], t),
          { name: "Ciclos", headers: ["Ciclo"], rows: [["Regresión"]] },
        ],
      },
      t,
    );
    const json = JSON.stringify(dd.content);
    const at = (s: string) => json.indexOf(s);
    expect(at("testPlan.step.schedule")).toBeLessThan(at("Go-live"));
    expect(at("Go-live")).toBeLessThan(at("testPlan.step.risks"));
    expect(at("testPlan.conclusion")).toBeLessThan(at("Regresión"));
  });
});

describe("levels and types in the PDF (UX-31)", () => {
  it("prints the levels, then the types one line per group, before the methodology", () => {
    const json = JSON.stringify(
      planDocDefinition(
        { ...sample, testTypeLines: ["Funcionales: Funcionales", "Confirmación y regresión: Confirmación"] },
        t,
      ).content,
    );
    const at = (s: string) => json.indexOf(s);
    expect(at("testPlan.testLevels")).toBeGreaterThan(-1);
    expect(at("testPlan.testLevels")).toBeLessThan(at("testPlan.testTypes"));
    expect(at("testPlan.testTypes")).toBeLessThan(at("testPlan.methodology"));
    expect(json).toContain('{"text":"Confirmación y regresión: Confirmación","style":"value"}');
  });
});
