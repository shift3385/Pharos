import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportedError } from "@shared/ui/notify";
import JSZip from "jszip";
import {
  exportAllProjects,
  exportProjectZip,
  type ExportProgress,
} from "./exportAll";

// The plan and case builders are covered in their modules (export/batch.test.ts);
// here they return named stubs so the test checks what lands in the ZIP.
// The revision-history option each plan was built with (PLN-02), by project.
const historyArgs = vi.hoisted(() => [] as [string, unknown][]);
vi.mock("@modules/test-plan", () => ({
  FILES_PER_PLAN: 2,
  projectHasPlan: async (id: string) => id === "a",
  projectPlanFiles: async (
    id: string,
    _u: string,
    _t: unknown,
    _l: string,
    onEach?: (n: string) => void,
    _s?: unknown,
    _c?: unknown,
    history?: unknown,
  ) => {
    historyArgs.push([id, history]);
    if (id !== "a") return [];
    const files = [
      { name: "Plan.xlsx", buffer: new Uint8Array([1]) },
      { name: "Plan.pdf", buffer: new Uint8Array([2]) },
    ];
    files.forEach((f) => onEach?.(f.name));
    return files;
  },
}));
vi.mock("@modules/test-cases", () => ({
  FILES_PER_CASE: 2,
  projectCaseCount: async () => 1,
  projectCaseFiles: async (
    id: string,
    _u: string,
    _t: unknown,
    _l: string,
    onEach?: (n: string) => void,
    onSkip?: (n: string) => void,
  ) => {
    if (id === "b") onSkip?.(`${id}-ATS_002.pdf`);
    const files = [
      { name: `${id}-ATS_001.xlsx`, buffer: new Uint8Array([3]) },
      { name: `${id}-ATS_001.pdf`, buffer: new Uint8Array([4]) },
    ];
    files.forEach((f) => onEach?.(f.name));
    return files;
  },
}));
// EXP-03: the cycles are read once per project and handed to both builders.
const loadCycleExport = vi.hoisted(() => vi.fn());
const cycleData = { cycles: [], configurations: [], items: new Map() };
vi.mock("@modules/cycles", () => ({ loadCycleExport }));
beforeEach(() => {
  loadCycleExport.mockReset().mockResolvedValue(cycleData);
});
vi.mock("../api/projectApi", () => ({
  projectApi: {
    list: async () => [
      { id: "a", name: "Alpha", planExportHistory: "revisions" },
      { id: "b", name: "Beta" },
    ],
  },
}));
const saved: { name: string; blob: Blob }[] = [];
vi.mock("@shared/export/saveFile", () => ({
  saveFile: async (name: string, blob: Blob) => {
    saved.push({ name, blob });
    return `D:\\Exports\\${name}`;
  },
}));

async function unzip(blob: Blob) {
  // jsdom's Blob has no arrayBuffer(); read it through a FileReader.
  const buffer = await new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
  return Object.keys((await JSZip.loadAsync(buffer)).files).sort();
}

const t = (k: string) => k;

describe("project ZIPs (EXP-02, UX-02)", () => {
  it("asks for the plan's revision history only for a project set to it (PLN-02)", async () => {
    historyArgs.length = 0;
    const names = { u1: "Test Smoke" };
    await exportAllProjects("u1", (k: string) => k, "es", undefined, names);
    expect(historyArgs).toEqual([
      ["a", { names }],
      ["b", undefined],
    ]);
    historyArgs.length = 0;
    await exportProjectZip(
      { id: "a", name: "Alpha", caseIdPrefix: "ATS_", caseIdDigits: 3, updatedAt: "", revision: 1 },
      "u1",
      (k: string) => k,
      "es",
      undefined,
      names,
    );
    expect(historyArgs).toEqual([["a", undefined]]);
  });


  it("the project ZIP holds the plan and case .xlsx and .pdf and is saved", async () => {
    saved.length = 0;
    const events: ExportProgress[] = [];
    const result = await exportProjectZip(
      {
        id: "a",
        name: "Alpha",
        caseIdPrefix: "ATS_",
        caseIdDigits: 3,
        updatedAt: "",
        revision: 1,
      },
      "u1",
      t,
      "es",
      (p) => events.push(p),
    );
    expect(result).toEqual({ files: 4, path: "D:\\Exports\\Alpha.zip", skipped: [] });
    expect(await unzip(saved[0].blob)).toEqual([
      "Alpha/",
      "Alpha/Plan.pdf",
      "Alpha/Plan.xlsx",
      "Alpha/a-ATS_001.pdf",
      "Alpha/a-ATS_001.xlsx",
    ]);
    const building = events.filter((e) => e.phase === "building");
    expect(building.at(-1)).toMatchObject({ done: 4, total: 4 });
    // Once for the project, with the items its cases need.
    expect(loadCycleExport).toHaveBeenCalledTimes(1);
    expect(loadCycleExport).toHaveBeenCalledWith("a", "u1", true);
  });

  // EXP-03 (review L4): a failure to read the cycles stops the ZIP before
  // anything is saved. Its toast is shown once, by the loader
  // (cycleTables.test.ts); the caller only sees a ReportedError.
  it("a failure to read the cycles saves no ZIP", async () => {
    saved.length = 0;
    loadCycleExport.mockRejectedValue(new ReportedError("cycles"));
    await expect(exportAllProjects("u1", t, "es")).rejects.toBeInstanceOf(ReportedError);
    expect(saved).toEqual([]);
  });

  it("the global ZIP has one folder per project, PDFs included", async () => {
    saved.length = 0;
    const result = await exportAllProjects("u1", t, "es");
    expect(result).toEqual({
      files: 6,
      path: "D:\\Exports\\pharos-export.zip",
      skipped: ["Beta/b-ATS_002.pdf"],
    });
    const names = await unzip(saved[0].blob);
    expect(names.filter((n) => n.endsWith(".pdf"))).toEqual([
      "Alpha/Plan.pdf",
      "Alpha/a-ATS_001.pdf",
      "Beta/b-ATS_001.pdf",
    ]);
  });
});
