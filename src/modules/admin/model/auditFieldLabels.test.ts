// FIX-43: every field an audited element can report has a label in both
// languages, so «Cambios» never shows a raw name («escaped», «roles»,
// «workspaceId»). The fields are read from the code that produces them: an
// event's changes are `journal::diff` of two snapshots, and a snapshot is
// the element's sync payload (`journal::snapshot` → the `read_payload` /
// `*_payload` functions of the desktop core), with `data` compared one level
// down; the keys of `data` are those of each element's data type.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import en from "@shared/i18n/locales/en.json";
import es from "@shared/i18n/locales/es.json";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
/** `journal.rs::BOOKKEEPING`: never part of a diff. */
const BOOKKEEPING = new Set(["revision", "updatedAt", "createdAt"]);

function rustFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return rustFiles(path);
    return name.endsWith(".rs") && !/tests?\.rs$/.test(name) ? [path] : [];
  });
}

/** The keys the payload functions write (`"key": …` in their bodies). The
 *  audit event's own payload (`audit.rs`) is not an audited element. */
function payloadKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of rustFiles(join(ROOT, "src-tauri", "src"))) {
    if (file.endsWith(`${"audit"}.rs`) && !file.endsWith("_audit.rs")) continue;
    const src = readFileSync(file, "utf8");
    for (const fn of src.matchAll(/\bfn (read_payload|payload|snapshot|\w+_payload)\s*[<(]/g)) {
      const open = src.indexOf("{", src.indexOf(")", fn.index));
      let depth = 0;
      let end = open;
      for (; end < src.length; end++) {
        if (src[end] === "{") depth++;
        else if (src[end] === "}" && --depth === 0) break;
      }
      for (const k of src.slice(open, end).matchAll(/"([a-z][A-Za-z0-9]*)"\s*:/g))
        if (!keys.has(k[1])) keys.set(k[1], `${relative(ROOT, file)}::${fn[1]}`);
    }
  }
  return keys;
}

/** The properties of each element's `data` type. */
const DATA_TYPES: [string, string][] = [
  ["src/modules/test-cases/model/types.ts", "TestCaseData"],
  ["src/modules/test-plan/model/types.ts", "TestPlanData"],
  ["src/modules/defects/model/types.ts", "DefectData"],
  ["src/modules/traceability/model/types.ts", "RequirementData"],
  ["src/modules/planner/model/types.ts", "CardData"],
  // FIX-51: a cycle's data is free-form JSON; its keys are listed here.
  ["src/modules/runs/report/completion/completionReport.ts", "CycleData"],
];

function dataKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const [file, name] of DATA_TYPES) {
    const source = ts.createSourceFile(file, readFileSync(join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true);
    let found = false;
    source.forEachChild((node) => {
      if (!ts.isInterfaceDeclaration(node) || node.name.text !== name) return;
      found = true;
      for (const m of node.members)
        if (ts.isPropertySignature(m) && m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)))
          keys.set(m.name.text, `${file}::${name}`);
    });
    expect(found, `${name} in ${file}`).toBe(true);
  }
  return keys;
}

/** FIX-51: the keys the desktop core writes into an element's free-form
 *  `data` (`data["closures"] = …`). FIX-43's version read only the payloads
 *  and the typed data, and a cycle's `data` has no type, so «Cambios:
 *  completionReport» slipped by; the web's keys are now the `CycleData` type. */
function coreDataKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of rustFiles(join(ROOT, "src-tauri", "src"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/\bdata\["([a-z][A-Za-z0-9]*)"\]\s*=/g))
      if (!keys.has(m[1])) keys.set(m[1], relative(ROOT, file));
  }
  return keys;
}

describe("audit field labels (FIX-43)", () => {
  const fields = new Map(
    [...payloadKeys(), ...dataKeys(), ...coreDataKeys()].filter(([k]) => !BOOKKEEPING.has(k)),
  );

  it("reads the keys of a cycle's free-form data (FIX-51)", () => {
    for (const k of ["closures", "completionReport"]) expect(fields.has(k), k).toBe(true);
  });

  it("reads the fields from the payloads and the data types", () => {
    // The ones the manual showed raw are among them.
    for (const k of ["workspaceId", "escaped", "labels", "roles", "defectKey", "runKey"]) expect(fields.has(k), k).toBe(true);
    expect(fields.size).toBeGreaterThan(150);
  });

  it.each([
    ["es", es],
    ["en", en],
  ] as const)("every audited field has a label in %s", (_lang, locale) => {
    const labels = (locale as { admin: { audit: { fields: Record<string, string> } } }).admin.audit.fields;
    const missing = [...fields].filter(([k]) => !labels[k]?.trim()).map(([k, from]) => `${k} (${from})`);
    expect(missing).toEqual([]);
  });
});
