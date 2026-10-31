// Public API of the custom-fields module (FLD-01, ADR-0018): definitions per
// project, value checks and formatting, the case type and automation status.
// It depends on no other domain module; test-cases and projects use it.
export { customFieldApi } from "./api/customFieldApi";
export { AUTOMATION_STATUSES, CASE_TYPES, FIELD_TYPES } from "./model/types";
export type {
  AutomationStatus,
  CaseType,
  CopySummary,
  CustomField,
  CustomFieldInput,
  CustomValues,
  FieldEntity,
  FieldOption,
  FieldType,
} from "./model/types";
export {
  defaultValues,
  fieldsFor,
  isFilled,
  keyFromLabel,
  missingRequired,
  ruleOf,
  validateValue,
  validateValues,
  validKey,
} from "./model/validate";
export type { FieldRule, ValueError } from "./model/validate";
export {
  effectiveAutomation,
  effectiveCaseType,
  formatValue,
  parseValue,
} from "./model/format";
export type { BooleanWords } from "./model/format";
export { CustomFieldsCard } from "./ui/CustomFieldsCard";
export type { ProjectOption } from "./ui/CopyFieldsDialog";
export { CustomFieldsSection } from "./ui/CustomFieldsSection";
export { customFieldIssues, fieldControlId } from "./model/issues";
