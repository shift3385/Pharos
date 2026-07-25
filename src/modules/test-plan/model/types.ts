// Test plan model (spec §5.1). Scalar/searchable fields live on the plan; the
// 21-step content lives in `data` so the shape can evolve without a migration.

export interface ScheduleSprint {
  name: string;
  start: string;
  end: string;
}
export interface ScheduleMilestone {
  name: string;
  date: string;
}
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
  sprints?: ScheduleSprint[];
  milestones?: ScheduleMilestone[];
  risks?: RiskItem[];
  communicationPlan?: string;
  closureCriteria?: ClosureCriterion[];
  purpose?: string;
  conclusion?: string;
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
