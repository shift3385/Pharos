// The 19 steps of the plan wizard (spec §5.1, ScrPlan) and when each one
// counts as completed: its main field has content. The navigation shows ✓ for
// those, and step 19 lists the ones still missing.
import type { FormState } from "./formState";

export const STEP_IDS = [
  "title",
  "meta",
  "summary",
  "scope",
  "types",
  "methodology",
  "levels",
  "deliverables",
  "environment",
  "tools",
  "testData",
  "defects",
  "roles",
  "schedule",
  "risks",
  "communication",
  "closure",
  "purpose",
  "conclusion",
] as const;
export type StepId = (typeof STEP_IDS)[number];

const text = (s: string) => s.trim().length > 0;
const some = (list: string[]) => list.some(text);

const COMPLETE: Record<StepId, (f: FormState) => boolean> = {
  title: (f) => text(f.title),
  meta: (f) => text(f.version) && text(f.planDate),
  summary: (f) => text(f.summary),
  scope: (f) => some(f.scopeIn),
  types: (f) => f.testTypes.length > 0,
  methodology: (f) =>
    f.methodologyType === "agile" ? f.sprintWeeks > 0 && f.ceremonies.length > 0 : some(f.phases),
  levels: (f) => f.testLevels.length > 0,
  deliverables: (f) => some(f.deliverables),
  environment: (f) => text(f.environmentConfig) || text(f.environmentRequirements),
  tools: (f) => f.tools.length > 0,
  testData: (f) => text(f.testDataManagement),
  defects: (f) => text(f.defectManagement),
  roles: (f) => f.roles.some((r) => text(r.role)),
  schedule: (f) => f.sprints.some((s) => text(s.name) || s.start) || f.milestones.some((m) => text(m.name)),
  risks: (f) => f.risks.some((r) => text(r.risk)),
  communication: (f) => text(f.communicationPlan),
  closure: (f) => f.closureCriteria.some((c) => text(c.criterion)),
  purpose: (f) => text(f.purpose),
  conclusion: (f) => text(f.conclusion),
};

export const isStepComplete = (id: StepId, form: FormState) => COMPLETE[id](form);

/** Completed flag of every step, in order. */
export const stepCompletion = (form: FormState) => STEP_IDS.map((id) => COMPLETE[id](form));
