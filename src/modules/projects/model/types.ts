// Project model (spec §5.1). A project is a container ("folder") that holds one
// test plan and its test cases. It also stores the per-project case-id numbering
// config: a literal prefix (e.g. "ATS_", "FT", "TC-") and a zero-padding width.

import type { Assert, Contract, Covers } from "@shared/contracts";

export interface Project {
  id: string;
  workspaceId: string;
  ownerId?: string;
  name: string;
  caseIdPrefix: string;
  caseIdDigits: number;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  caseIdPrefix: string;
  caseIdDigits: number;
  updatedAt: string;
  revision: number;
}

export interface ProjectInput {
  name: string;
  caseIdPrefix?: string;
  caseIdDigits?: number;
  /** Authenticated user that owns the project (set on create). */
  ownerId?: string;
}

// The Rust contract (BASE-05, ADR-0026): what Rust sends covers what this model
// reads, and what this model sends covers what Rust reads. `tsc` fails if a
// field is renamed, dropped or retyped on either side.
export type _RustContract = [
  Assert<Covers<Contract.ProjectSummary, ProjectSummary>>,
  Assert<Covers<Contract.Project, Project>>,
  Assert<Covers<ProjectInput, Contract.ProjectInput>>,
];
