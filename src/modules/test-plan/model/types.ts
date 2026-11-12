// Test plan model (spec §5.1). Scalar/searchable fields live on the plan; the
// 22-step wizard content (UX-31, PLN-06) lives in `data` so the shape can evolve without a migration.

import type { Assert, Contract, Covers } from "@shared/contracts";
import type { ProvenanceMap } from "@modules/ai";
import type { MetricKind, MetricOp, MetricUnit } from "./metrics";

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
  /** The plan metric that measures it (`data.metrics[].id`, PLN-06). The
   *  derivation evaluates it from the metric; without it (or when the
   *  metric is gone) it reads the text, as before 0.4.0. The text is still
   *  written from the metric, for exports and older readers (ADR-0040). */
  metricId?: string;
  /** Mandatory for closing a cycle (DOC-02); `false` is advisory. Absent
   *  means mandatory. */
  blocking?: boolean;
}

/** A metric with its measurable objective (PLN-06, ISO/IEC/IEEE 29119-3).
 *  `kind` null is the team's own metric: nobody measures it for them, so a
 *  criterion linked to it is judged by hand. */
export interface PlanMetric {
  /** Unique in the plan. */
  id: string;
  kind: MetricKind | null;
  /** The own metric's name; "" for a catalog kind (its label is shown). */
  name: string;
  op: MetricOp;
  target: number;
  /** The kind's unit (fixed), or the own metric's. */
  unit: MetricUnit;
  note?: string;
}

/** A training need of the team (step «Roles, independencia y formación»). */
export interface TrainingItem {
  need: string;
  when: string;
}

/** Levels of independence of testing, least to most (CTFL v4 §1.5.3). */
export type IndependenceLevel = "author" | "peer" | "team" | "organization" | "external";

/** Estimation techniques of CTFL v4 §5.1.4 plus expert judgement. */
export type EstimationTechnique = "ratio" | "extrapolation" | "wideband" | "threePoint" | "expert";

/** «Estimación y presupuesto»: effort in person-days. Three-point
 *  estimation keeps its three figures; the others the effort alone. */
export interface Estimation {
  technique?: EstimationTechnique;
  effort?: number;
  optimistic?: number;
  likely?: number;
  pessimistic?: number;
  budget?: string;
  notes?: string;
}

/** Who approved the plan, when, and which version (PLN-07). Kept while the
 *  plan stays «Aprobado»; editing its content sends it back to «Revisado»
 *  and clears it (the audit keeps the history). */
export interface PlanApproval {
  /** Account id. */
  by: string;
  /** Name at the time, for the document. */
  byName: string;
  /** ISO instant. */
  at: string;
  version: string;
}

/** The plan wizard content: spec §5.1 plus ISO/IEC/IEEE 29119-3 (PLN-06) in 22 steps. All optional — filled progressively. */
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
  // ISO/IEC/IEEE 29119-3 and CTFL v4 §5.1.1 (PLN-06).
  assumptions?: string[];
  constraints?: string[];
  /** Catalog keys (TECHNIQUE_GROUPS) and the team's own techniques. */
  techniques?: string[];
  independence?: IndependenceLevel;
  independenceNote?: string;
  training?: TrainingItem[];
  estimation?: Estimation;
  entryCriteria?: string[];
  suspensionCriteria?: string[];
  resumptionCriteria?: string[];
  metrics?: PlanMetric[];
  /** The document's identifier (PLN-04): `TP-<prefix>-<6 hex>` unless the
   *  team writes its own. */
  documentId?: string;
  approval?: PlanApproval | null;
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

/** One create or update audit event of a plan (ADR-0015), for its history
 *  (PLN-02). `actor` is `user:<id>` or `system:<component>`. */
export interface PlanHistoryEvent {
  at: string;
  actor: string;
  action: string;
  /** `{ field: [before, after] }` (`data.<key>` one level down); null once
   *  redacted. */
  changes: Record<string, [unknown, unknown]> | null;
}

/** A revision copy: the title and content a save overwrote, with who saved
 *  and when (desktop only). */
export interface PlanHistoryRevision {
  revision: number;
  title: string;
  data: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
}

/** What the exported plan's «Historial de revisiones» is built from: the
 *  plan's creation, its audit events (oldest first) and its revision copies
 *  (by revision; always empty on the web). */
export interface PlanHistorySource {
  createdAt: string;
  createdBy: string;
  events: PlanHistoryEvent[];
  revisions: PlanHistoryRevision[];
}

// The Rust contract (BASE-05, ADR-0026): what Rust sends covers what this model
// reads, and what this model sends covers what Rust reads. `tsc` fails if a
// field is renamed, dropped or retyped on either side.
export type _RustContract = [
  Assert<Covers<Contract.TestPlanSummary, TestPlanSummary>>,
  Assert<Covers<Contract.TestPlan, TestPlan>>,
  Assert<Covers<Contract.TestPlanRevisionSummary, RevisionSummary>>,
  Assert<Covers<Contract.TestPlanRevisionDetail, RevisionDetail>>,
  Assert<Covers<Contract.TestPlanHistorySource, PlanHistorySource>>,
  Assert<Covers<TestPlanInput, Contract.TestPlanInput>>,
];
