// Project model (spec §5.1). A project is a container ("folder") that holds one
// test plan and its test cases. It also stores the per-project case-id numbering
// config: a literal prefix (e.g. "ATS_", "FT", "TC-") and a zero-padding width.

export interface Project {
  id: string;
  workspaceId: string;
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
}
