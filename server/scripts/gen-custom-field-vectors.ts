// Writes src-tauri/tests/fixtures/custom-field-vectors.json (FLD-01,
// ADR-0018): the cases every custom field validator must agree on — Rust
// (`custom_fields.rs`), the server (`modules/domain/custom-fields.ts`) and the
// client (`src/modules/custom-fields/model/validate.ts`). The expected results
// are written here by hand; the script only spells out long strings and the
// ids, which come from the server's implementation and are checked by all
// three. Run: `npx tsx scripts/gen-custom-field-vectors.ts` (in server/).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fieldId } from "../src/modules/domain/custom-fields";

const OPTIONS = [
  { id: "OPT00001", label: "Chrome", archived: false },
  { id: "OPT00002", label: "IE 11", archived: true },
];
const rule = (fieldType: string, extra: Record<string, unknown> = {}) => ({
  fieldKey: "f",
  fieldType,
  options: fieldType.endsWith("select") ? OPTIONS : [],
  appliesToCaseTypes: null,
  archived: false,
  ...extra,
});

type Vector = { field: ReturnType<typeof rule>; value: unknown; previous?: unknown; error: string | null };
const v = (fieldType: string, value: unknown, error: string | null, previous?: unknown): Vector => ({
  field: rule(fieldType),
  value,
  ...(previous === undefined ? {} : { previous }),
  error,
});

const values: Vector[] = [
  v("text", "Chrome 120", null),
  v("text", "a".repeat(500), null),
  v("text", "a".repeat(501), "too_long"),
  v("text", "😀".repeat(250), null),
  v("text", "😀".repeat(251), "too_long"),
  v("text", 5, "type"),
  v("long_text", "line 1\nline 2", null),
  v("long_text", "a".repeat(10_001), "too_long"),
  v("number", 1.5, null),
  v("number", -3, null),
  v("number", "1", "type"),
  v("number", true, "type"),
  v("integer", 3, null),
  v("integer", -9_007_199_254_740_991, null),
  v("integer", 3.5, "type"),
  v("integer", 9_007_199_254_740_992, "range"),
  v("integer", "3", "type"),
  v("date", "2024-02-29", null),
  v("date", "2026-02-29", "date"),
  v("date", "2026-13-01", "date"),
  v("date", "2026-1-01", "date"),
  v("date", "2026-04-31", "date"),
  v("date", 20260101, "type"),
  v("boolean", true, null),
  v("boolean", false, null),
  v("boolean", "true", "type"),
  v("select", "OPT00001", null),
  v("select", "OPT00002", "option"),
  v("select", "OPT00002", null, "OPT00002"),
  v("select", "NOPE0000", "option"),
  v("select", ["OPT00001"], "type"),
  v("multi_select", ["OPT00001"], null),
  v("multi_select", [], null),
  v("multi_select", ["OPT00001", "OPT00001"], "duplicate"),
  v("multi_select", ["OPT00002"], "option"),
  v("multi_select", ["OPT00002", "OPT00001"], null, ["OPT00002"]),
  v("multi_select", "OPT00001", "type"),
  v("multi_select", [1], "type"),
  v("user", "ana.garcia", null),
  v("user", "   ", "type"),
  v("user", "", "type"),
  v("url", "https://example.com/x?y=1", null),
  v("url", "http://localhost:8080", null),
  v("url", "ftp://example.com", "url"),
  v("url", "https://", "url"),
  v("url", "https://a b.com", "url"),
  v("url", "example.com", "url"),
  v("future_type", { anything: 1 }, null),
];

// Whole `data.custom` checks of a case save: what is kept, what is dropped,
// which error comes out.
const fields = [
  rule("integer", { fieldKey: "points" }),
  rule("select", { fieldKey: "browser" }),
  rule("text", { fieldKey: "old_field", archived: true }),
  rule("boolean", { fieldKey: "signed_off", appliesToCaseTypes: ["checklist"] }),
];
const cases = [
  {
    name: "valid values, unknown key kept",
    caseType: "standard",
    data: { custom: { points: 3, browser: "OPT00001", from_elsewhere: "x" } },
    expected: { custom: { points: 3, browser: "OPT00001", from_elsewhere: "x" } },
    error: null,
  },
  {
    name: "null values dropped",
    caseType: "standard",
    data: { custom: { points: null, browser: "OPT00001" } },
    expected: { custom: { browser: "OPT00001" } },
    error: null,
  },
  {
    name: "an empty map is removed",
    caseType: "standard",
    data: { steps: [], custom: { points: null } },
    expected: { steps: [] },
    error: null,
  },
  {
    name: "archived field and field of another case type keep any value",
    caseType: "standard",
    data: { custom: { old_field: 42, signed_off: "yes" } },
    expected: { custom: { old_field: 42, signed_off: "yes" } },
    error: null,
  },
  {
    name: "a field that applies is checked",
    caseType: "checklist",
    data: { custom: { signed_off: "yes" } },
    expected: null,
    error: "custom_field.type:signed_off",
  },
  {
    name: "wrong type",
    caseType: "standard",
    data: { custom: { points: 2.5 } },
    expected: null,
    error: "custom_field.type:points",
  },
  {
    name: "an archived option only where it already was",
    caseType: "standard",
    data: { custom: { browser: "OPT00002" } },
    previous: { custom: { browser: "OPT00002" } },
    expected: { custom: { browser: "OPT00002" } },
    error: null,
  },
  {
    name: "custom that is not an object",
    caseType: "standard",
    data: { custom: [1] },
    expected: null,
    error: "custom_field.type:custom",
  },
];

const ids = [
  ["00000000-0000-4000-8000-000000000001", "test_case", "browser"],
  ["00000000-0000-4000-8000-000000000001", "test_case", "points"],
  ["00000000-0000-4000-8000-000000000002", "test_case", "browser"],
  ["00000000-0000-4000-8000-000000000001", "defect", "browser"],
].map(([projectId, entity, fieldKey]) => ({
  projectId,
  entity,
  fieldKey,
  id: fieldId(projectId, entity, fieldKey),
}));

const keys = [
  ["browser", true],
  ["a", true],
  ["build_2", true],
  ["a".repeat(40), true],
  ["a".repeat(41), false],
  ["Browser", false],
  ["2fa", false],
  ["_x", false],
  ["has-dash", false],
  ["ñandu", false],
  ["", false],
].map(([key, valid]) => ({ key, valid }));

const out = fileURLToPath(
  new URL("../../src-tauri/tests/fixtures/custom-field-vectors.json", import.meta.url),
);
writeFileSync(out, JSON.stringify({ ids, keys, values, caseFields: fields, cases }, null, 2) + "\n");
console.log(`wrote ${out}`);
