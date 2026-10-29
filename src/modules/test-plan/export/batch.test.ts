import { describe, expect, it, vi } from "vitest";
import { projectPlanFiles, projectPlanStatus } from "./batch";

// See test-cases/export/batch.test.ts: the .xlsx builder and pdfmake are
// stubbed; the PDF stub records the real document definition.
const pdfDocs: string[] = [];
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
            title: "Checkout",
            version: "1.0",
            author: "Ada",
            status: "reviewed",
            data: {},
          },
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
    expect(await projectPlanFiles("none", "u1", t, "es")).toEqual([]);
  });

  it("reports the plan status for the Home (UX-08)", async () => {
    expect(await projectPlanStatus("p1", "u1")).toBe("reviewed");
    expect(await projectPlanStatus("none", "u1")).toBeNull();
  });
});
