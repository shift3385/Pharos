import { describe, expect, it } from "vitest";
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
});
