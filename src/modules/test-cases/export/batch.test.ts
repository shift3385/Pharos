import { describe, expect, it, vi } from "vitest";
import { projectCaseFiles, projectCaseProgress } from "./batch";

// The .xlsx builder fetches the bundled template and pdfmake needs its font
// VFS, neither available in jsdom: the builder is stubbed, and the PDF stub
// records the document definition it was given (the real one per case).
const pdfDocs: string[] = [];
vi.mock("@shared/export/pdfDoc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/export/pdfDoc")>()),
  pdfBytes: async (dd: unknown) => {
    pdfDocs.push(JSON.stringify(dd));
    return new TextEncoder().encode("%PDF-1.3");
  },
}));
vi.mock("./caseXlsx", () => ({
  buildCaseXlsx: async (c: { scenarioId: string }) => ({
    filename: `${c.scenarioId}.xlsx`,
    buffer: new ArrayBuffer(1),
  }),
}));
vi.mock("../api/testCaseApi", () => ({
  testCaseApi: {
    list: async () => [
      { id: "c1", status: "approved" },
      { id: "c2", status: "draft" },
      { id: "c3", status: "obsolete" },
    ],
    get: async (id: string) => ({
      id,
      scenarioId: `ATS_00${id.slice(1)}`,
      title: `Case ${id}`,
      version: "1.0",
      status: "draft",
      priority: "high",
      author: "Ada",
      data: { steps: ["Open"], expectedResult: "Shown" },
    }),
  },
}));

const t = (k: string) => k;

describe("case files for the project ZIP (EXP-02, spec §5.4)", () => {
  it("each case contributes its .xlsx and its .pdf", async () => {
    pdfDocs.length = 0;
    const built: string[] = [];
    const files = await projectCaseFiles("p1", "u1", t, "es", (n) =>
      built.push(n),
    );
    expect(files.map((f) => f.name)).toEqual([
      "ATS_001.xlsx",
      "ATS_001.pdf",
      "ATS_002.xlsx",
      "ATS_002.pdf",
      "ATS_003.xlsx",
      "ATS_003.pdf",
    ]);
    expect(built).toEqual(files.map((f) => f.name));
    expect(new TextDecoder().decode(files[1].buffer as Uint8Array)).toMatch(
      /^%PDF-/,
    );
    expect(pdfDocs).toHaveLength(3);
    expect(pdfDocs[0]).toContain("Case c1");
  });
});

describe("case progress for the Home (UX-08)", () => {
  it("counts approved cases out of the cases that are not obsolete", async () => {
    expect(await projectCaseProgress("p1", "u1")).toEqual({
      approved: 1,
      total: 2,
    });
  });
});
