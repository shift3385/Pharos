// Test case model (spec §5.3 + ISTQB attributes). Scalars are columns on the
// case; the rest lives in `data`.

export interface TestCaseData {
  mappedUseCase?: string;
  caseDate?: string;
  description?: string;
  preconditions?: string[];
  steps?: string[];
  expectedResult?: string;
  postconditions?: string[];
  acceptanceCriteria?: string[];
  testData?: string;
  notes?: string;
  // ISTQB attributes not covered by the template (spec §5.3)
  traceability?: string;
  dataRequirements?: string;
  environmentRequirements?: string;
}

export type TestCaseStatus = "draft" | "reviewed" | "approved" | "obsolete";
export type TestCasePriority = "low" | "medium" | "high" | "critical";

export interface TestCase {
  id: string;
  workspaceId: string;
  scenarioId: string;
  title: string;
  version: string;
  status: string;
  priority: string;
  author: string;
  data: TestCaseData;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface TestCaseSummary {
  id: string;
  scenarioId: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: string;
  revision: number;
}

export interface TestCaseInput {
  scenarioId?: string;
  title: string;
  version?: string;
  status?: string;
  priority?: string;
  author: string;
  data: TestCaseData;
}

export interface RevisionSummary {
  id: string;
  revision: number;
  title: string;
  createdAt: string;
}
