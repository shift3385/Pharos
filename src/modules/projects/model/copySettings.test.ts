import { describe, expect, it, vi } from "vitest";
import {
  copyAfterCreate,
  copyFailed,
  copyParts,
  loadSourceFacts,
  newProjectInput,
  partOffered,
  type CopyPart,
} from "./copySettings";

const source = {
  id: "src",
  caseIdDigits: 6,
  planExportHistory: "revisions" as const,
};
const all = new Set<CopyPart>(["fields", "digits", "planHistory", "retention"]);
const data = { name: "  Nuevo ", prefix: " NUE- ", digits: 4 };

describe("copying another project's settings (UX-25, UX-29)", () => {
  it("offers the evidence retention on the desktop only", () => {
    expect(copyParts(true)).toEqual([
      "fields",
      "digits",
      "planHistory",
      "retention",
    ]);
    expect(copyParts(false)).toEqual(["fields", "digits", "planHistory"]);
    expect(partOffered("retention", false)).toBe(false);
    expect(partOffered("fields", false)).toBe(true);
  });

  it("creates with the general data as typed and the source's plan history, never its name or prefix", () => {
    const base = {
      name: "Nuevo",
      ownerId: "u",
      caseIdPrefix: "NUE-",
      caseIdDigits: 4,
    };
    // The digits are a field: a copied value the user changed stays changed.
    expect(newProjectInput(data, "u", source, all)).toEqual({
      ...base,
      planExportHistory: "revisions",
    });
    expect(newProjectInput(data, "u", source, new Set(["fields"]))).toEqual(
      base,
    );
    expect(newProjectInput(data, "u", null, all)).toEqual(base);
    // A source without the setting is «current».
    expect(
      newProjectInput(
        data,
        "u",
        { id: "s", caseIdDigits: 3 },
        new Set(["planHistory"]),
      ),
    ).toEqual({
      ...base,
      planExportHistory: "current",
    });
  });

  it("reads the live fields per entity and, on the desktop, the retention of the source", async () => {
    const listFields = vi.fn(async (_p: string, _u: string, entity: string) =>
      entity === "test_case"
        ? [
            { archivedAt: null },
            { archivedAt: null },
            { archivedAt: "2026-01-01" },
          ]
        : entity === "defect"
          ? [{ archivedAt: null }]
          : [],
    );
    const retention = vi.fn(async () => ({ projectId: "src", kinds: [] }));
    expect(
      await loadSourceFacts("src", "u", true, { listFields, retention }),
    ).toEqual({
      fields: { test_case: 2, defect: 1 },
      retention: { projectId: "src", kinds: [] },
    });
    expect(listFields).toHaveBeenCalledTimes(5);

    retention.mockClear();
    const web = await loadSourceFacts("src", "u", false, {
      listFields,
      retention,
    });
    expect(web.retention).toBeNull();
    expect(retention).not.toHaveBeenCalled();

    // A failed read is «not read», never an error.
    const failing = await loadSourceFacts("src", "u", true, {
      listFields: async () => {
        throw new Error("down");
      },
      retention: async () => {
        throw new Error("down");
      },
    });
    expect(failing).toEqual({ fields: null, retention: null });
  });

  it("copies the fields of every entity and the retention, and reports what failed without stopping", async () => {
    const copyFields = vi.fn(
      async (_f: string, _t: string, _u: string, entity: string) => {
        if (entity === "defect") throw new Error("down");
      },
    );
    const copyRetention = vi.fn(async () => {
      throw new Error("down");
    });
    const outcome = await copyAfterCreate("src", "dst", "u", all, {
      copyFields,
      copyRetention,
    });
    expect(copyFields.mock.calls.map((c) => c[3])).toEqual([
      "test_case",
      "requirement",
      "defect",
      "run",
      "test_cycle",
    ]);
    expect(copyFields).toHaveBeenCalledWith("src", "dst", "u", "test_case");
    expect(copyRetention).toHaveBeenCalledWith("src", "dst", "u");
    expect(outcome).toEqual({
      fieldsFailed: ["defect"],
      retentionFailed: true,
    });
    expect(copyFailed(outcome)).toBe(true);
  });

  it("copies only the checked parts", async () => {
    const copyFields = vi.fn(async () => {});
    const copyRetention = vi.fn(async () => {});
    const outcome = await copyAfterCreate(
      "src",
      "dst",
      "u",
      new Set(["digits"]),
      { copyFields, copyRetention },
    );
    expect(copyFields).not.toHaveBeenCalled();
    expect(copyRetention).not.toHaveBeenCalled();
    expect(copyFailed(outcome)).toBe(false);
  });
});
