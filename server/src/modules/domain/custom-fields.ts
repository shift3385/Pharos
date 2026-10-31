// Custom fields (FLD-01, ADR-0018) on the server: the deterministic id of a
// definition and the value checks of a case save made through the web's
// domain API. The same rules as the desktop's `custom_fields.rs` and the
// client's `src/modules/custom-fields/model/validate.ts`, all checked against
// `src-tauri/tests/fixtures/custom-field-vectors.json`.
import { uuidV5 } from "../sync/stable-steps";

/** Namespace of the definition ids (`custom_fields.rs::NS_CUSTOM_FIELD`). */
export const NS_CUSTOM_FIELD = "3a7c91d2-5b4e-5f60-8a1b-c3d5e7f90b2d";

export const FIELD_ENTITIES = ["test_case", "requirement", "defect", "run", "test_cycle"] as const;
export const FIELD_TYPES = [
  "text",
  "long_text",
  "number",
  "integer",
  "date",
  "boolean",
  "select",
  "multi_select",
  "user",
  "url",
] as const;
export const CASE_TYPES = ["standard", "checklist"] as const;
export const AUTOMATION_STATUSES = ["manual", "to_automate", "automated"] as const;

/** Key, inside a case's `data`, of the case fields kept for a read-only
 *  client (`custom_fields.rs::STASH_KEY`, migration 0027). */
export const CASE_FIELDS_STASH_KEY = "__caseFields";

const MAX = { text: 500, long_text: 10_000, user: 200, url: 2_000 } as const;

/** `UUIDv5(NS_CUSTOM_FIELD, "<project>:<entity>:<key>")`. */
export const fieldId = (projectId: string, entity: string, fieldKey: string): string =>
  uuidV5(NS_CUSTOM_FIELD, `${projectId}:${entity}:${fieldKey}`);

/** `^[a-z][a-z0-9_]{0,39}$`. */
export const validKey = (key: string): boolean => /^[a-z][a-z0-9_]{0,39}$/.test(key);

export interface FieldOption {
  id: string;
  label: string;
  archived?: boolean;
}

/** What the value checks need of a definition. */
export interface FieldRule {
  fieldKey: string;
  fieldType: string;
  options: FieldOption[];
  appliesToCaseTypes: string[] | null;
  archived: boolean;
}

function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d >= 1 && d <= days;
}

function validUrl(s: string): boolean {
  const rest = s.startsWith("https://") ? s.slice(8) : s.startsWith("http://") ? s.slice(7) : null;
  if (rest === null) return false;
  const host = rest.split(/[/?#]/)[0];
  return s.length <= MAX.url && host !== "" && !/\s/.test(s);
}

/** Checks one value (`custom_fields.rs::validate_value`). Returns the error
 *  code or null. */
export function validateValue(field: FieldRule, value: unknown, previous?: unknown): string | null {
  const optionOk = (id: string, kept: boolean) =>
    field.options.some((o) => o.id === id && (!o.archived || kept));
  switch (field.fieldType) {
    case "text":
    case "long_text":
    case "user": {
      if (typeof value !== "string") return "type";
      if (value.length > MAX[field.fieldType]) return "too_long";
      if (field.fieldType === "user" && value.trim() === "") return "type";
      return null;
    }
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "type";
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
      // A type from a newer client: not checked.
      return null;
  }
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Normalizes and checks `data.custom` for a save
 *  (`custom_fields.rs::validate_values`): returns the data to store, or the
 *  error `custom_field.<code>:<key>`. */
export function validateValues(
  fields: FieldRule[],
  caseType: string,
  data: unknown,
  previous?: unknown,
): { data: unknown } | { error: string } {
  if (!isObject(data) || !("custom" in data)) return { data };
  const out: Json = { ...data };
  const custom = out.custom;
  if (custom === null) {
    delete out.custom;
    return { data: out };
  }
  if (!isObject(custom)) return { error: "custom_field.type:custom" };
  const values = Object.fromEntries(Object.entries(custom).filter(([, v]) => v !== null));
  if (Object.keys(values).length === 0) {
    delete out.custom;
    return { data: out };
  }
  out.custom = values;
  const prev = isObject(previous) && isObject(previous.custom) ? previous.custom : {};
  for (const [key, value] of Object.entries(values)) {
    const field = fields.find((f) => f.fieldKey === key);
    if (!field || field.archived) continue;
    if (field.appliesToCaseTypes && !field.appliesToCaseTypes.includes(caseType)) continue;
    const code = validateValue(field, value, prev[key]);
    if (code) return { error: `custom_field.${code}:${key}` };
  }
  return { data: out };
}
