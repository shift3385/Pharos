// The 17 steps of the plan wizard (spec §5.1, ScrPlan, UX-31) and when each
// one counts as completed: its main field has content. The navigation shows ✓
// for those, and the last step lists the ones still missing.
import type { FormState } from "./formState";

export const STEP_IDS = [
  "identification",
  "summary",
  "scope",
  "levelsTypes",
  "methodology",
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

/** Steps of the 19-step wizard (before 0.3) that were joined into one
 *  (UX-31): «Título» + «Versión, fecha y autor» are the document's
 *  identification (ISO/IEC/IEEE 29119-3), «Tipos» + «Niveles de prueba» one
 *  step before «Metodología». A link or saved state that names an old step
 *  lands on the joined one. */
export const LEGACY_STEPS: Record<string, StepId> = {
  title: "identification",
  meta: "identification",
  types: "levelsTypes",
  levels: "levelsTypes",
};

/** Index of a step by its id, today's or a joined one; -1 when unknown. */
export function stepIndex(ref: string | null | undefined): number {
  if (!ref) return -1;
  const id = (STEP_IDS as readonly string[]).includes(ref) ? (ref as StepId) : LEGACY_STEPS[ref];
  return id ? STEP_IDS.indexOf(id) : -1;
}

const text = (s: string) => s.trim().length > 0;
const some = (list: string[]) => list.some(text);

/** What «Metodología» still needs, in the order the step shows it (FIX-14): the
 *  sprint length and at least one ceremony when agile (each ceremony always has
 *  a frequency, defaulted), at least one phase when traditional. The step's ✓
 *  and its inline hint both come from here, so they cannot disagree. */
export type MethodologyGap = "sprintWeeks" | "ceremonies" | "phases";
export function methodologyGaps(
  f: Pick<FormState, "methodologyType" | "sprintWeeks" | "ceremonies" | "phases">,
): MethodologyGap[] {
  if (f.methodologyType !== "agile") return some(f.phases) ? [] : ["phases"];
  const gaps: MethodologyGap[] = [];
  if (!(f.sprintWeeks > 0)) gaps.push("sprintWeeks");
  if (f.ceremonies.length === 0) gaps.push("ceremonies");
  return gaps;
}

const COMPLETE: Record<StepId, (f: FormState) => boolean> = {
  // The document's identification: title, version and date (the author
  // always comes from the account).
  identification: (f) => text(f.title) && text(f.version) && text(f.planDate),
  summary: (f) => text(f.summary),
  scope: (f) => some(f.scopeIn),
  // At least one level and one type: «what is tested, at which level and
  // with which type» (ISTQB).
  levelsTypes: (f) => f.testLevels.length > 0 && f.testTypes.length > 0,
  methodology: (f) => methodologyGaps(f).length === 0,
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
