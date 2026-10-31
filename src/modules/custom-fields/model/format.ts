// How a custom field value reads to a person (case list, .xlsx sheet, PDF):
// option labels instead of ids, Sí/No, dates as stored (ISO). A value whose
// field is unknown or archived reads as its JSON, so nothing is hidden.

import {
  AUTOMATION_STATUSES,
  CASE_TYPES,
  type AutomationStatus,
  type CaseType,
  type CustomField,
} from "./types";

/** NULL, or a value this build does not know, reads as the default
 *  (ADR-0018 amendment: never set = standard / manual). */
export const effectiveCaseType = (v: unknown): CaseType =>
  (CASE_TYPES as readonly unknown[]).includes(v) ? (v as CaseType) : "standard";
export const effectiveAutomation = (v: unknown): AutomationStatus =>
  (AUTOMATION_STATUSES as readonly unknown[]).includes(v)
    ? (v as AutomationStatus)
    : "manual";

export interface BooleanWords {
  yes: string;
  no: string;
}

export function formatValue(
  field: CustomField | undefined,
  value: unknown,
  words: BooleanWords,
): string {
  if (value === null || value === undefined) return "";
  if (!field) return typeof value === "string" ? value : JSON.stringify(value);
  const option = (id: unknown) =>
    field.options.find((o) => o.id === id)?.label ?? String(id);
  switch (field.fieldType) {
    case "boolean":
      return value === true
        ? words.yes
        : value === false
          ? words.no
          : String(value);
    case "select":
      return option(value);
    case "multi_select":
      return Array.isArray(value)
        ? value.map(option).join(", ")
        : String(value);
    default:
      return typeof value === "string" || typeof value === "number"
        ? String(value)
        : JSON.stringify(value);
  }
}

/** Parses the text of a cell back into a value of the field's type (.xlsx
 *  import). Option labels match case-insensitively. Null = not a valid value. */
export function parseValue(
  field: CustomField,
  text: string,
  words: BooleanWords,
): unknown {
  const s = text.trim();
  if (s === "") return null;
  const byLabel = (label: string) =>
    field.options.find(
      (o) => o.label.toLowerCase() === label.trim().toLowerCase(),
    )?.id ?? null;
  switch (field.fieldType) {
    case "number": {
      const n = Number(s.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    case "integer": {
      const n = Number(s);
      return Number.isSafeInteger(n) ? n : null;
    }
    case "boolean": {
      const low = s.toLowerCase();
      if (
        [words.yes.toLowerCase(), "true", "yes", "sí", "si", "1"].includes(low)
      )
        return true;
      if ([words.no.toLowerCase(), "false", "no", "0"].includes(low))
        return false;
      return null;
    }
    case "select":
      return byLabel(s);
    case "multi_select": {
      const ids = s.split(",").map(byLabel);
      return ids.every((id) => id !== null) ? [...new Set(ids)] : null;
    }
    default:
      return s;
  }
}
