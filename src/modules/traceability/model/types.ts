// Traceability model (v0.0.2, TRZ-01/02). A requirement is a test basis item of
// a project (ISTQB CTFL 1.4.4). Its `requirementKey` (REQ-001…) is stable: it is
// immutable once created, links test cases (`data.requirementKeys`) and travels
// as a Gherkin tag (@REQ-001).

import type { Assert, Contract, Covers } from "@shared/contracts";

export type RequirementPriority = "low" | "medium" | "high";

export const REQUIREMENT_PRIORITIES: RequirementPriority[] = ["low", "medium", "high"];

export const REQUIREMENT_KEY_PREFIX = "REQ-";
export const REQUIREMENT_KEY_DIGITS = 3;

export interface Requirement {
  id: string;
  projectId: string;
  requirementKey: string;
  title: string;
  description: string;
  priority: RequirementPriority;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface RequirementInput {
  projectId: string;
  /** Only honoured on create (empty → auto-numbered); keys are immutable. */
  requirementKey?: string;
  title: string;
  description?: string;
  priority?: RequirementPriority;
  userId: string;
}

/** One row of a bulk import (CSV). Rows whose key exists update it. */
export interface RequirementImportRow {
  requirementKey?: string;
  title: string;
  description?: string;
  priority?: RequirementPriority;
}

export interface ImportSummary {
  created: number;
  updated: number;
  /** Keys of deleted requirements in the file: never reused, not imported. */
  skipped: string[];
}

/** A key must be usable as a Gherkin tag: no whitespace and no characters that
 *  tag expressions treat specially (mirrors the Rust validation). */
export function isValidRequirementKey(key: string): boolean {
  return /^[A-Za-z0-9_.:-]+$/.test(key);
}

// The Rust contract (BASE-05, ADR-0026): what Rust sends covers what this model
// reads, and what this model sends covers what Rust reads. `tsc` fails if a
// field is renamed, dropped or retyped on either side.
export type _RustContract = [
  Assert<Covers<Contract.Requirement, Requirement>>,
  Assert<Covers<Contract.ImportSummary, ImportSummary>>,
  Assert<Covers<RequirementInput, Contract.RequirementInput>>,
  Assert<Covers<RequirementImportRow, Contract.RequirementImportRow>>,
];
