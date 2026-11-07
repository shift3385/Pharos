import { describe, expect, it, vi } from "vitest";
import { projectPlanFiles, projectPlanStatus } from "./batch";

// See test-cases/export/batch.test.ts: the .xlsx builder and pdfmake are
// stubbed; the PDF stub records the real document definition.
const pdfDocs: string[] = [];
// One cycle (EXP-03): c1 is in it, by its whole case; its progress comes
// from the list's summary, as the «Ciclos» screen shows it.
vi.mock("@modules/cycles/api/cycleApi", () => ({
  cycleApi: {
    list: async () => [
      {
        id: "cy1",
        projectId: "p1",
        cycleKey: "CYC-001",
        title: "Regresión 1.4",
        status: "active",
        startsOn: "2026-11-02",
        endsOn: "2026-11-06",
        milestone: "Beta",
        sprint: "S2",
        build: "1.4.0",
        environment: "staging",
        configurationIds: [],
        items: 1,
        runs: 1,
        progress: { total: 2, executed: 1, passed: 1, failed: 0, blocked: 0, skipped: 0, other: 0, notRun: 1 },
      },
    ],
    items: async () => [{ id: "i1", cycleId: "cy1", testCaseId: "c1", flowId: null, exampleRowId: null, assignee: "Ada" }],
  },
  configurationApi: { list: async () => [] },
}));
vi.mock("@shared/export/pdfDoc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/export/pdfDoc")>()),
  pdfBytes: async (dd: unknown) => {
    pdfDocs.push(JSON.stringify(dd));
    return new TextEncoder().encode("%PDF-1.3");
  },
}));
vi.mock("./planXlsx", () => ({
  buildPlanXlsx: async (p: { filenameBase: string }) => ({
    filename: `${p.filenameBase}.xlsx`,
    buffer: new ArrayBuffer(1),
  }),
}));
vi.mock("../api/testPlanApi", () => ({
  testPlanApi: {
    byProject: async (projectId: string) =>
      projectId === "none"
        ? null
        : {
            id: "tp1",
            title: "Checkout",
            version: "1.0",
            author: "Ada",
            status: "reviewed",
            data: { milestones: [{ name: "Entrega beta", date: "2026-11-20" }] },
          },
    // PLN-02: one save of u1 that approved the plan.
    history: async () => ({
      createdAt: "2026-11-05T09:00:00.000Z",
      createdBy: "u1",
      revisions: [],
      events: [
        {
          at: "2026-11-06T21:03:00.000Z",
          actor: "user:u1",
          action: "update",
          changes: { version: ["1.0", "1.1"], status: ["draft", "approved"] },
        },
      ],
    }),
  },
}));

const t = (k: string) => k;

describe("plan files for the project ZIP (EXP-02, spec §5.4)", () => {
  it("the plan contributes its .xlsx and its .pdf, nothing without a plan", async () => {
    const built: string[] = [];
    const files = await projectPlanFiles("p1", "u1", t, "es", (n) =>
      built.push(n),
    );
    expect(files.map((f) => f.name)).toEqual(["Checkout.xlsx", "Checkout.pdf"]);
    expect(built).toEqual(["Checkout.xlsx", "Checkout.pdf"]);
    expect(new TextDecoder().decode(files[1].buffer as Uint8Array)).toMatch(
      /^%PDF-/,
    );
    expect(pdfDocs[0]).toContain("Checkout");
    // EXP-03: milestones and cycles after the template's sections; the
    // progress is the cycle list's, in the screen's words.
    expect(pdfDocs[0]).toContain("Entrega beta");
    expect(pdfDocs[0]).toContain("CYC-001");
    expect(pdfDocs[0]).toContain("1/2 · 50 %");
    expect(pdfDocs[0]).toContain("Beta · S2");
    expect(await projectPlanFiles("none", "u1", t, "es")).toEqual([]);
  });

  it("carries the revision history only when the project asks for it (PLN-02)", async () => {
    pdfDocs.length = 0;
    await projectPlanFiles("p1", "u1", t, "es");
    expect(pdfDocs[0]).not.toContain("testPlan.history.title");
    await projectPlanFiles("p1", "u1", t, "es", undefined, undefined, undefined, {
      names: { u1: "Test Smoke" },
      timeZone: "UTC",
    });
    expect(pdfDocs[1]).toContain("testPlan.history.title");
    expect(pdfDocs[1]).toContain("Test Smoke");
    expect(pdfDocs[1]).toContain("2026-11-06 21:03");
    expect(pdfDocs[1]).toContain("testPlan.history.approved");
  });

  it("reports the plan status for the Home (UX-08)", async () => {
    expect(await projectPlanStatus("p1", "u1")).toBe("reviewed");
    expect(await projectPlanStatus("none", "u1")).toBeNull();
  });
});
