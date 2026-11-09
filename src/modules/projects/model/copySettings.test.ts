import { describe, expect, it, vi } from "vitest";
import {
  copyAfterCreate,
  copyFailed,
  copyParts,
  withCopiedSettings,
  type CopyPart,
} from "./copySettings";

const source = {
  id: "src",
  caseIdDigits: 6,
  planExportHistory: "revisions" as const,
};
const all = new Set<CopyPart>(["fields", "digits", "planHistory", "retention"]);

describe("«Copiar ajustes de…» (UX-25)", () => {
  it("offers the evidence retention on the desktop only", () => {
    expect(copyParts(true)).toEqual([
      "fields",
      "digits",
      "planHistory",
      "retention",
    ]);
    expect(copyParts(false)).toEqual(["fields", "digits", "planHistory"]);
  });

  it("puts the digits and the plan history in the create, never the name or the prefix", () => {
    const input = { name: "Nuevo", caseIdPrefix: "NUE-", ownerId: "u" };
    expect(withCopiedSettings(input, source, all)).toEqual({
      ...input,
      caseIdDigits: 6,
      planExportHistory: "revisions",
    });
    expect(withCopiedSettings(input, source, new Set(["fields"]))).toEqual(
      input,
    );
    expect(withCopiedSettings(input, null, all)).toEqual(input);
    // A source without the setting is «current».
    expect(
      withCopiedSettings(
        input,
        { id: "s", caseIdDigits: 3 },
        new Set(["planHistory"]),
      ),
    ).toEqual({
      ...input,
      planExportHistory: "current",
    });
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
