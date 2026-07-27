// Test case model (spec §5.3 + ISTQB attributes). Scalars are columns on the
// case; the rest lives in `data`.

// Gherkin authoring level chosen when creating a case (spec §5.3 amendment):
//  - basic:    Feature/Scenario + Given/When/Then/And (one simple scenario)
//  - outline:  + Scenario Outline + Examples (one parametrized scenario)
//  - advanced: + Background + Rule + multiple scenarios (case = whole Feature),
//              authored directly in the Gherkin editor (featureSource).
export type GherkinLevel = "basic" | "outline" | "advanced";

// Data table backing a Scenario Outline (spec §5.3 amendment).
export interface ExampleTable {
  headers: string[];
  rows: string[][];
}

// A flow of an advanced case: the main (happy) path or an alternative flow. Each
// flow is a full scenario — its own preconditions, steps, expected result and,
// optionally, an Examples table (making it a Scenario Outline).
export interface Flow {
  id: string;
  name: string;
  preconditions?: string[];
  steps: string[];
  expectedResult: string;
  examples?: ExampleTable;
}

export interface TestCaseData {
  gherkinLevel?: GherkinLevel;
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
  // Scenario Outline data (only when gherkinLevel === "outline").
  examples?: ExampleTable;
  // Advanced level: shared preconditions (Background) + the flows (main +
  // alternatives). Each flow becomes a scenario.
  background?: string[];
  flows?: Flow[];
  // Raw Gherkin feature kept for the editable Gherkin view of advanced cases.
  featureSource?: string;
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
  projectId?: string;
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
  gherkinLevel: GherkinLevel;
  updatedAt: string;
  revision: number;
}

export interface TestCaseInput {
  projectId: string;
  scenarioId?: string;
  title: string;
  version?: string;
  status?: string;
  priority?: string;
  author: string;
  data: TestCaseData;
  // Browser-fallback numbering hints (ignored by the Rust store, which reads the
  // project's configured prefix/width from the database).
  caseIdPrefix?: string;
  caseIdDigits?: number;
}

export interface RevisionSummary {
  id: string;
  revision: number;
  title: string;
  createdAt: string;
}
