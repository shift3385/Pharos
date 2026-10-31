// What blocks saving a case in the editor (FLD-01, ADR-0018 amendment).

import type { Issue } from "@shared/validation";
import type { CaseType, CustomField, CustomValues } from "./types";
import { fieldsFor, isFilled, ruleOf, validateValue } from "./validate";

/** Id of the control of a field in the case editor (the error summary
 *  focuses it). */
export const fieldControlId = (key: string) => `cf-${key}`;

/** What blocks saving a case in the editor (ADR-0018 amendment): a value of
 *  the wrong type, or a required field without one. Fields that do not show
 *  for the case type are not checked; their values stay. */
export function customFieldIssues(
  fields: CustomField[],
  caseType: CaseType,
  values: CustomValues,
  previous: CustomValues = {},
): { field: CustomField; issue: Issue }[] {
  const out: { field: CustomField; issue: Issue }[] = [];
  for (const f of fieldsFor(fields, caseType)) {
    const v = values[f.fieldKey];
    if (!isFilled(v)) {
      if (f.required)
        out.push({
          field: f,
          issue: { code: "customRequired", severity: "error" },
        });
      continue;
    }
    const code = validateValue(ruleOf(f), v, previous[f.fieldKey]);
    if (code)
      out.push({
        field: f,
        issue: { code: `customFields.error.${code}`, severity: "error" },
      });
  }
  return out;
}
