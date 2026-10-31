// Test plan model (spec §5.1). Scalar/searchable fields live on the plan; the
// 21-step content lives in `data` so the shape can evolve without a migration.

import type { Assert, Contract, Covers } from "@shared/contracts";
import type { ProvenanceMap } from "@modules/ai";

/** A sprint of step 14. `id` is stable within the plan; dates are ISO
 *  `YYYY-MM-DD` (a legacy value that is not stays as written). */
export interface ScheduleSprint {
  id: string;
  name: string;
  start: string;
  end: string;
}
/** A milestone of step 14 (same id and date rules as a sprint). */
export interface ScheduleMilestone {
  id: string;
  name: string;
  date: string;
}
/** As stored: plans saved before 0.2.0 have no ids, `normalizeSchedule` gives
 *  them on read (RED-W5). */
export type StoredSprint = Omit<ScheduleSprint, "id"> & { id?: string };
export type StoredMilestone = Omit<ScheduleMilestone, "id"> & { id?: string };
export interface RiskItem {
  risk: string;
  mitigation: string;
}
export interface RoleItem {
  role: string;
  responsibility: string;
}
export interface ClosureCriterion {
  criterion: string;
  metric: string;
}

/** The 21-step wizard content (spec §5.1). All optional — filled progressively. */
export interface TestPlanData {
  summary?: string;
  scopeIn?: string[];
  scopeOut?: string[];
  testTypes?: string[];
  methodologyType?: "agile" | "traditional";
  sprintWeeks?: number;
  ceremonies?: string[];
  /** Ceremony key → frequency key (CEREMONY_FREQUENCIES), PLN-01. Missing
   *  entries (plans saved before 0.1.0) read as the industry default. */
  ceremonyFrequency?: Record<string, string>;
  phases?: string[];
  testLevels?: string[];
  deliverables?: string[];
  environmentConfig?: string;
  environmentRequirements?: string;
  tools?: string[];
  automationStrategy?: string;
  testDataManagement?: string;
  defectManagement?: string;
  roles?: RoleItem[];
  sprints?: StoredSprint[];
  milestones?: StoredMilestone[];
  risks?: RiskItem[];
  communicationPlan?: string;
  closureCriteria?: ClosureCriterion[];
  purpose?: string;
  conclusion?: string;
  /** AI provenance per assisted field (IA-01); the ai module owns the shape. */
  aiProvenance?: ProvenanceMap;
}

export type TestPlanStatus = "draft" | "reviewed" | "approved" | "obsolete";

export interface TestPlan {
  id: string;
  workspaceId: string;
  title: string;
  version: string;
  planDate: string | null;
  author: string;
  status: string;
  data: TestPlanData;
  projectId?: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface TestPlanSummary {
  id: string;
  title: string;
  version: string;
  status: string;
  updatedAt: string;
  revision: number;
}

export interface TestPlanInput {
  projectId?: string | null;
  title: string;
  version?: string;
  planDate?: string | null;
  author: string;
  status?: string;
  data: TestPlanData;
  /** Signed-in user making the change (owner check and audit fields). */
  userId: string;
}

export interface RevisionSummary {
  id: string;
  revision: number;
  title: string;
  createdAt: string;
}

export interface RevisionDetail extends RevisionSummary {
  data: TestPlanData;
}

// The Rust contract (BASE-05, ADR-0026): what Rust sends covers what this model
// reads, and what this model sends covers what Rust reads. `tsc` fails if a
// field is renamed, dropped or retyped on either side.
export type _RustContract = [
  Assert<Covers<Contract.TestPlanSummary, TestPlanSummary>>,
  Assert<Covers<Contract.TestPlan, TestPlan>>,
  Assert<Covers<Contract.TestPlanRevisionSummary, RevisionSummary>>,
  Assert<Covers<Contract.TestPlanRevisionDetail, RevisionDetail>>,
  Assert<Covers<TestPlanInput, Contract.TestPlanInput>>,
];
