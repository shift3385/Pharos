// Value checks of custom fields (FLD-01): the same rules as the desktop's
// `custom_fields.rs` and the server's `modules/domain/custom-fields.ts`, all
// checked against `src-tauri/tests/fixtures/custom-field-vectors.json`. The
// editor runs them before saving, so a Rust refusal is the exception.

import type { CaseType, CustomField, CustomValues, FieldOption } from "./types";

/** What the checks need of a definition. */
export interface FieldRule {
  fieldKey: string;
  fieldType: string;
  options: FieldOption[];
  appliesToCaseTypes: string[] | null;
  archived: boolean;
}

export const ruleOf = (f: CustomField): FieldRule => ({
  fieldKey: f.fieldKey,
  fieldType: f.fieldType,
  options: f.options,
  appliesToCaseTypes: f.appliesToCaseTypes,
  archived: f.archivedAt !== null,
});

/** Error codes of a value (`custom_fields.rs::validate_value`). */
export type ValueError =
  "type" | "too_long" | "option" | "duplicate" | "date" | "url" | "range";

export const MAX_LENGTH = {
  text: 500,
  long_text: 10_000,
  user: 200,
  url: 2_000,
} as const;

/** `^[a-z][a-z0-9_]{0,39}$`. */
export const validKey = (key: string): boolean =>
  /^[a-z][a-z0-9_]{0,39}$/.test(key);

/** A key proposed from a label: «Navegador web» → `navegador_web`. */
export function keyFromLabel(label: string): string {
  const key = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 40)
    .replace(/_+$/, "");
  return key;
}

export function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    mo - 1
  ];
  return d >= 1 && d <= days;
}

function validUrl(s: string): boolean {
  const rest = s.startsWith("https://")
    ? s.slice(8)
    : s.startsWith("http://")
      ? s.slice(7)
      : null;
  if (rest === null) return false;
  return (
    s.length <= MAX_LENGTH.url && rest.split(/[/?#]/)[0] !== "" && !/\s/.test(s)
  );
}

/** Checks one value; `previous` is the stored one (an archived option stays
 *  valid only where it already was). */
export function validateValue(
  field: FieldRule,
  value: unknown,
  previous?: unknown,
): ValueError | null {
  const optionOk = (id: string, kept: boolean) =>
    field.options.some((o) => o.id === id && (!o.archived || kept));
  switch (field.fieldType) {
    case "text":
    case "long_text":
    case "user":
      if (typeof value !== "string") return "type";
      if (value.length > MAX_LENGTH[field.fieldType]) return "too_long";
      if (field.fieldType === "user" && value.trim() === "") return "type";
      return null;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : "type";
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) return "type";
      return Math.abs(value) > Number.MAX_SAFE_INTEGER ? "range" : null;
    case "date":
      if (typeof value !== "string") return "type";
      return validDate(value) ? null : "date";
    case "boolean":
      return typeof value === "boolean" ? null : "type";
    case "url":
      if (typeof value !== "string") return "type";
      return validUrl(value) ? null : "url";
    case "select":
      if (typeof value !== "string") return "type";
      return optionOk(value, previous === value) ? null : "option";
    case "multi_select": {
      if (!Array.isArray(value)) return "type";
      const before = new Set(Array.isArray(previous) ? previous : []);
      const seen = new Set<string>();
      for (const id of value) {
        if (typeof id !== "string") return "type";
        if (seen.has(id)) return "duplicate";
        seen.add(id);
        if (!optionOk(id, before.has(id))) return "option";
      }
      return null;
    }
    default:
      return null;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The whole `data.custom` check of a save (`validate_values`). */
export function validateValues(
  fields: FieldRule[],
  caseType: string,
  data: unknown,
  previous?: unknown,
): { data: unknown } | { error: string } {
  if (!isObject(data) || !("custom" in data)) return { data };
  const out: Record<string, unknown> = { ...data };
  if (out.custom === null) {
    delete out.custom;
    return { data: out };
  }
  if (!isObject(out.custom)) return { error: "custom_field.type:custom" };
  const values = Object.fromEntries(
    Object.entries(out.custom).filter(([, v]) => v !== null),
  );
  if (Object.keys(values).length === 0) {
    delete out.custom;
    return { data: out };
  }
  out.custom = values;
  const prev =
    isObject(previous) && isObject(previous.custom) ? previous.custom : {};
  for (const [key, value] of Object.entries(values)) {
    const field = fields.find((f) => f.fieldKey === key);
    if (!field || field.archived) continue;
    if (
      field.appliesToCaseTypes &&
      !field.appliesToCaseTypes.includes(caseType)
    )
      continue;
    const code = validateValue(field, value, prev[key]);
    if (code) return { error: `custom_field.${code}:${key}` };
  }
  return { data: out };
}

/** The live fields the editor shows for a case of `caseType`, in order. */
export function fieldsFor(
  fields: CustomField[],
  caseType: CaseType,
): CustomField[] {
  return fields
    .filter((f) => f.archivedAt === null)
    .filter(
      (f) => !f.appliesToCaseTypes || f.appliesToCaseTypes.includes(caseType),
    )
    .sort((a, b) => a.position - b.position);
}

/** A value that counts as filled in for `required`. */
export const isFilled = (value: unknown): boolean =>
  value !== undefined &&
  value !== null &&
  !(typeof value === "string" && value.trim() === "") &&
  !(Array.isArray(value) && value.length === 0);

/** Required fields of `caseType` without a value: the editor blocks the save
 *  and names them (ADR-0018 amendment); import, AI and sync never check this. */
export function missingRequired(
  fields: CustomField[],
  caseType: CaseType,
  values: CustomValues,
): CustomField[] {
  return fieldsFor(fields, caseType).filter(
    (f) => f.required && !isFilled(values[f.fieldKey]),
  );
}

/** Values a new case starts with: the default of each field that has one. */
export function defaultValues(
  fields: CustomField[],
  caseType: CaseType,
): CustomValues {
  return Object.fromEntries(
    fieldsFor(fields, caseType)
      .filter((f) => f.defaultValue !== null && f.defaultValue !== undefined)
      .map((f) => [f.fieldKey, f.defaultValue]),
  );
}
