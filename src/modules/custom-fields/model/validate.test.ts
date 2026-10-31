import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  effectiveAutomation,
  effectiveCaseType,
  formatValue,
  parseValue,
} from "./format";
import type { CustomField } from "./types";
import {
  defaultValues,
  fieldsFor,
  keyFromLabel,
  missingRequired,
  validateValue,
  validateValues,
  validKey,
  type FieldRule,
} from "./validate";

const vectors = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../../../../src-tauri/tests/fixtures/custom-field-vectors.json",
    ),
    "utf8",
  ),
);

describe("shared vectors (the desktop and the server check the same file)", () => {
  it("keys", () => {
    for (const k of vectors.keys) expect(validKey(k.key), k.key).toBe(k.valid);
  });
  it("values", () => {
    for (const v of vectors.values)
      expect(
        validateValue(v.field as FieldRule, v.value, v.previous),
        JSON.stringify(v).slice(0, 100),
      ).toBe(v.error);
  });
  it("whole case saves", () => {
    for (const c of vectors.cases) {
      const got = validateValues(
        vectors.caseFields as FieldRule[],
        c.caseType,
        c.data,
        c.previous,
      );
      expect(got, c.name).toEqual(
        c.error ? { error: c.error } : { data: c.expected },
      );
    }
  });
});

const field = (over: Partial<CustomField>): CustomField => ({
  id: over.fieldKey ?? "f",
  projectId: "p1",
  entity: "test_case",
  fieldKey: "f",
  label: "F",
  description: "",
  fieldType: "text",
  options: [],
  required: false,
  defaultValue: null,
  appliesToCaseTypes: null,
  position: 0,
  archivedAt: null,
  createdAt: "2026-10-31 10:00:00",
  updatedAt: "2026-10-31 10:00:00",
  revision: 1,
  ...over,
});

describe("editor helpers", () => {
  const browser = field({
    fieldKey: "browser",
    fieldType: "select",
    position: 1,
    required: true,
    options: [
      { id: "OPT00001", label: "Chrome", archived: false },
      { id: "OPT00002", label: "Firefox", archived: false },
    ],
  });
  const signed = field({
    fieldKey: "signed",
    fieldType: "boolean",
    position: 0,
    appliesToCaseTypes: ["checklist"],
    defaultValue: false,
  });
  const old = field({
    fieldKey: "old",
    archivedAt: "2026-10-01 00:00:00",
    required: true,
  });

  it("proposes a key from a label", () => {
    expect(keyFromLabel("Navegador web")).toBe("navegador_web");
    expect(keyFromLabel("¿Versión 2.0?")).toBe("version_2_0");
    expect(keyFromLabel("123 abc")).toBe("abc");
    expect(validKey(keyFromLabel("Ámbito de la prueba"))).toBe(true);
  });

  it("shows live fields of the case type, in order, and names the missing required ones", () => {
    expect(
      fieldsFor([browser, signed, old], "standard").map((f) => f.fieldKey),
    ).toEqual(["browser"]);
    expect(
      fieldsFor([browser, signed, old], "checklist").map((f) => f.fieldKey),
    ).toEqual(["signed", "browser"]);
    expect(
      missingRequired([browser, old], "standard", {}).map((f) => f.fieldKey),
    ).toEqual(["browser"]);
    expect(
      missingRequired([browser], "standard", { browser: "OPT00001" }),
    ).toEqual([]);
    expect(defaultValues([browser, signed], "checklist")).toEqual({
      signed: false,
    });
  });

  it("formats and parses values", () => {
    const words = { yes: "Sí", no: "No" };
    const multi = { ...browser, fieldType: "multi_select" as const };
    expect(formatValue(browser, "OPT00002", words)).toBe("Firefox");
    expect(formatValue(multi, ["OPT00001", "OPT00002"], words)).toBe(
      "Chrome, Firefox",
    );
    expect(formatValue(signed, true, words)).toBe("Sí");
    expect(formatValue(undefined, { a: 1 }, words)).toBe('{"a":1}');
    expect(parseValue(browser, "firefox", words)).toBe("OPT00002");
    expect(parseValue(multi, "Chrome, Firefox", words)).toEqual([
      "OPT00001",
      "OPT00002",
    ]);
    expect(parseValue(multi, "Chrome, Safari", words)).toBeNull();
    expect(parseValue(signed, "sí", words)).toBe(true);
    expect(
      parseValue(field({ fieldType: "integer" }), "4.5", words),
    ).toBeNull();
    expect(parseValue(field({ fieldType: "number" }), "4,5", words)).toBe(4.5);
  });

  it("reads a never-set case type and automation status as the defaults", () => {
    expect(effectiveCaseType(null)).toBe("standard");
    expect(effectiveCaseType("checklist")).toBe("checklist");
    expect(effectiveCaseType("from_the_future")).toBe("standard");
    expect(effectiveAutomation(undefined)).toBe("manual");
    expect(effectiveAutomation("automated")).toBe("automated");
  });
});
