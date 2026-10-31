// Custom fields per project (FLD-01, ADR-0018), and the case type and
// automation status of a test case. A definition has an immutable key and
// type; values live in each record's `data.custom`, keyed by the field key.

import type { Assert, Contract, Covers } from "@shared/contracts";

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
export type FieldType = (typeof FIELD_TYPES)[number];

/** The shape of a case (ADR-0018): steps / Gherkin, or a checklist. */
export const CASE_TYPES = ["standard", "checklist"] as const;
export type CaseType = (typeof CASE_TYPES)[number];

/** Separate from the shape: a Gherkin case may run by hand or with
 *  playwright-bdd. */
export const AUTOMATION_STATUSES = [
  "manual",
  "to_automate",
  "automated",
] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

/** Entities a definition can belong to; 0.2.0 has UI for test cases only. */
export type FieldEntity =
  "test_case" | "requirement" | "defect" | "run" | "test_cycle";

export interface FieldOption {
  /** 8 Crockford base32 characters; empty for a new one (Rust fills it). */
  id: string;
  label: string;
  archived: boolean;
}

export interface CustomField {
  id: string;
  projectId: string;
  entity: FieldEntity;
  fieldKey: string;
  label: string;
  description: string;
  fieldType: FieldType;
  options: FieldOption[];
  required: boolean;
  defaultValue: unknown;
  /** null = every case type. */
  appliesToCaseTypes: CaseType[] | null;
  position: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface CustomFieldInput {
  projectId: string;
  entity?: FieldEntity;
  /** Only read on create. */
  fieldKey: string;
  label: string;
  description?: string;
  /** Only read on create. */
  fieldType: FieldType;
  options?: FieldOption[];
  required?: boolean;
  defaultValue?: unknown;
  appliesToCaseTypes?: CaseType[] | null;
  userId: string;
}

export interface CopySummary {
  copied: number;
  /** Keys the target project already had. */
  skipped: string[];
}

/** `data.custom`: field key → value. */
export type CustomValues = Record<string, unknown>;

export type _RustContract = [
  Assert<Covers<Contract.CustomField, CustomField>>,
  Assert<Covers<Contract.FieldOption, FieldOption>>,
  Assert<Covers<Contract.CopySummary, CopySummary>>,
  Assert<Covers<CustomFieldInput, Contract.CustomFieldInput>>,
];
