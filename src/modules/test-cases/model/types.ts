// Test case model (spec §5.3 + ISTQB attributes). Scalars are columns on the
// case; the rest lives in `data`.

import type { Assert, Contract, Covers } from "@shared/contracts";
import type { ProvenanceMap } from "@modules/ai";

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
  /** The user’s own scenario tags (without "@"), e.g. smoke. */
  tags?: string[];
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
  // Linked requirements (stable keys, e.g. REQ-014) — the structured trace to
  // the test basis (v0.0.2, TRZ-01/02). Exported as @REQ-014 feature tags.
  requirementKeys?: string[];
  // The user’s own Gherkin tags (without "@"), kept on round-trip (TRZ-03).
  // The case ID tag and the requirement tags are derived, never stored here.
  featureTags?: string[];
  scenarioTags?: string[];
  // Free-text "other references" kept from v0.0.1 (links, story ids…).
  traceability?: string;
  dataRequirements?: string;
  environmentRequirements?: string;
  // AI provenance (IA-01): `description` when drafted with AI, `case` when the
  // whole case came from "Suggest tests". Shown until a person reviews it.
  aiProvenance?: ProvenanceMap;
}

/** A requirement a case can link to (supplied by the projects module, so
 *  test-cases does not depend on the traceability module). */
export interface RequirementOption {
  requirementKey: string;
  title: string;
}

/** The slice of a case the traceability matrix needs. */
export interface TraceableCase {
  id: string;
  scenarioId: string;
  title: string;
  status: string;
  requirementKeys: string[];
  traceability: string;
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
  /** Some AI-generated content of the case is still pending review (IA-01). */
  aiPending?: boolean;
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
  /** Signed-in user making the change (owner check and audit fields). */
  userId: string;
  // Numbering hints, ignored: the desktop and the server number from the
  // project's own series (BASE-10).
  caseIdPrefix?: string;
  caseIdDigits?: number;
}

export interface RevisionSummary {
  id: string;
  revision: number;
  title: string;
  createdAt: string;
}

// The Rust contract (BASE-05, ADR-0026): what Rust sends covers what this model
// reads, and what this model sends covers what Rust reads. `tsc` fails if a
// field is renamed, dropped or retyped on either side.
export type _RustContract = [
  Assert<Covers<Contract.TestCaseSummary, TestCaseSummary>>,
  Assert<Covers<Contract.TestCase, TestCase>>,
  Assert<Covers<Contract.TestCaseRevisionSummary, RevisionSummary>>,
  Assert<Covers<TestCaseInput, Contract.TestCaseInput>>,
];
