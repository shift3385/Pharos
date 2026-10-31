// The «Campos personalizados» sheet of a case .xlsx (FLD-01, ADR-0018
// decision 2): the case type, the automation status and the custom field
// values, in their own sheet so the template sheets stay identical to the
// ones in docs/referencias/. A case with the defaults and no values has no
// sheet, so its export is exactly what it was before.

import {
  effectiveAutomation,
  effectiveCaseType,
  formatValue,
  isFilled,
  parseValue,
  type AutomationStatus,
  type CaseType,
  type CustomField,
  type CustomValues,
} from "@modules/custom-fields";
import { norm } from "@shared/import/xlsx";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export interface CustomSheetRow {
  label: string;
  /** The field key, or one of the two fixed keys below. */
  key: string;
  value: string;
}

/** Keys of the fixed rows: a dot never appears in a field key, so they
 *  cannot collide with one. */
export const CASE_TYPE_KEY = "pharos.case_type";
export const AUTOMATION_KEY = "pharos.automation_status";

/** The localized name and headers of the «Campos personalizados» sheet. */
export const customSheetLabels = (t: Translate) => ({
  name: t("testCase.exportSheet"),
  headers: [
    t("customFields.sheet.field"),
    t("customFields.sheet.key"),
    t("customFields.sheet.value"),
  ] as [string, string, string],
});

/** Sheet names the import recognizes (es, en). */
export const CUSTOM_SHEET_NAMES = ["Campos personalizados", "Custom fields"];

export function customSheetRows(
  c: {
    caseType?: string | null;
    automationStatus?: string | null;
    custom?: CustomValues;
  },
  fields: CustomField[],
  t: Translate,
): CustomSheetRow[] {
  const type = effectiveCaseType(c.caseType);
  const automation = effectiveAutomation(c.automationStatus);
  const values = Object.entries(c.custom ?? {}).filter(([, v]) => isFilled(v));
  if (type === "standard" && automation === "manual" && values.length === 0)
    return [];
  const words = {
    yes: t("customFields.section.yes"),
    no: t("customFields.section.no"),
  };
  const ordered = [...fields].sort((a, b) => a.position - b.position);
  const known = ordered
    .filter((f) => isFilled(c.custom?.[f.fieldKey]))
    .map((f) => ({
      label: f.label,
      key: f.fieldKey,
      value: formatValue(f, c.custom?.[f.fieldKey], words),
    }));
  const unknown = values
    .filter(([k]) => !fields.some((f) => f.fieldKey === k))
    .map(([key, v]) => ({
      label: key,
      key,
      value: formatValue(undefined, v, words),
    }));
  return [
    {
      label: t("testCase.caseType"),
      key: CASE_TYPE_KEY,
      value: t(`testCase.caseTypeLabel.${type}`),
    },
    {
      label: t("testCase.automation"),
      key: AUTOMATION_KEY,
      value: t(`testCase.automationLabel.${automation}`),
    },
    ...known,
    ...unknown,
  ];
}

/** What an imported sheet sets on the case: the fixed rows by their labels
 *  (es or en; `labels` are keyed by `norm`ed label), each field's value parsed by its type. A value that does not
 *  parse is left out and reported in `skipped`; a key without a definition
 *  keeps its text (it may be another project's field). */
export function readCustomSheet(
  rows: { key: string; text: string }[],
  fields: CustomField[],
  labels: {
    caseType: Map<string, string>;
    automation: Map<string, string>;
  },
  words: { yes: string; no: string },
): {
  caseType?: CaseType;
  automationStatus?: AutomationStatus;
  custom: CustomValues;
  skipped: string[];
} {
  const out: ReturnType<typeof readCustomSheet> = { custom: {}, skipped: [] };
  for (const { key, text } of rows) {
    if (!key || !text.trim()) continue;
    if (key === CASE_TYPE_KEY) {
      const v = labels.caseType.get(norm(text));
      if (v) out.caseType = v as CaseType;
      else out.skipped.push(key);
      continue;
    }
    if (key === AUTOMATION_KEY) {
      const v = labels.automation.get(norm(text));
      if (v) out.automationStatus = v as AutomationStatus;
      else out.skipped.push(key);
      continue;
    }
    const field = fields.find((f) => f.fieldKey === key);
    if (!field) {
      out.custom[key] = text;
      continue;
    }
    const value = parseValue(field, text, words);
    if (value === null) out.skipped.push(key);
    else out.custom[key] = value;
  }
  return out;
}
