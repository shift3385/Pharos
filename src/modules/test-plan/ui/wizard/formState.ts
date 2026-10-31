// The plan wizard's form (spec §5.1): its shape, how it is built from a plan,
// an import or a revision, and how it becomes what is saved and exported.
// Pure functions, moved out of TestPlanWizard (RED-V2).
import type { ProvenanceMap } from "@modules/ai";
import { duplicateRows, type Issue } from "@shared/validation";
import type { ExportablePlan } from "../../export/planXlsx";
import type {
  ClosureCriterion,
  RiskItem,
  RoleItem,
  ScheduleMilestone,
  ScheduleSprint,
  TestPlan,
  TestPlanData,
  TestPlanInput,
} from "../../model/types";
import { DEFAULT_DELIVERABLES, ROLE_KEYS, TEST_LEVELS, TEST_TYPES } from "../../model/catalogs";
import {
  deliverableLabels,
  normalizeDeliverables,
  normalizeTools,
  toolLabels,
} from "../../model/catalogLabels";
import { frequenciesFor, methodologyText } from "../../model/methodology";
import {
  isIsoDay,
  normalizeSchedule,
  overlaps,
  sprintDays,
} from "../../model/schedule";

type Translate = (key: string) => string;

export interface FormState {
  title: string;
  version: string;
  planDate: string;
  status: string;
  summary: string;
  scopeIn: string[];
  scopeOut: string[];
  testTypes: string[];
  methodologyType: "agile" | "traditional";
  sprintWeeks: number;
  ceremonies: string[];
  ceremonyFrequency: Record<string, string>;
  phases: string[];
  testLevels: string[];
  /** Catalog keys (DELIVERABLE_GROUPS) and the team's own entries. */
  deliverables: string[];
  environmentConfig: string;
  environmentRequirements: string;
  /** Catalog keys (TOOL_NAMES) and the team's own tools. */
  tools: string[];
  automationStrategy: string;
  testDataManagement: string;
  defectManagement: string;
  roles: RoleItem[];
  sprints: ScheduleSprint[];
  milestones: ScheduleMilestone[];
  risks: RiskItem[];
  communicationPlan: string;
  closureCriteria: ClosureCriterion[];
  purpose: string;
  conclusion: string;
  /** AI provenance of the assisted fields (IA-01). */
  aiProvenance: ProvenanceMap;
}

/** Fields the wizard can draft with AI (keys of the provenance map). */
export type AssistedField =
  | "summary"
  | "environmentConfig"
  | "environmentRequirements"
  | "automationStrategy"
  | "purpose"
  | "conclusion";
/** Assisted fields plus the list the AI can add rows to (IA-10). */
export type ReviewableField = AssistedField | "risks";

/** Days a sprint should last: the sprint weeks of step 6 × 7 in an agile
 *  plan, else none (a traditional plan has no sprint length). */
export function expectedSprintDays(f: Pick<FormState, "methodologyType" | "sprintWeeks">): number | null {
  return f.methodologyType === "agile" && f.sprintWeeks > 0 ? f.sprintWeeks * 7 : null;
}

/** Per-sprint validation (step 14, RED-W5), first problem only: a missing or
 *  invalid date (legacy rows), an end before the start, an overlap with
 *  another sprint, or a length other than the step 6 sprint (agile only).
 *  All are warnings (draft rule, ADR-0027): the plan still saves, since a
 *  draft can be wrong for a while and parallel sprints can be legitimate. */
export function sprintIssues(sprints: ScheduleSprint[], expectedDays: number | null = null): (Issue | null)[] {
  const over = overlaps(sprints);
  return sprints.map((s): Issue | null => {
    if (!s.start || !s.end) return { code: "testPlan.schedule.missingDate", severity: "warning" };
    if (!isIsoDay(s.start) || !isIsoDay(s.end))
      return { code: "testPlan.schedule.invalidDate", severity: "warning" };
    if (s.end < s.start) return { code: "testPlan.sprintDateError", severity: "warning" };
    const other = over.get(s.id);
    if (other !== undefined)
      return { code: "testPlan.schedule.overlap", severity: "warning", params: { name: other } };
    const days = sprintDays(s);
    if (expectedDays && days !== expectedDays)
      return {
        code: "testPlan.schedule.duration",
        severity: "warning",
        params: { days, expected: expectedDays, weeks: expectedDays / 7 },
      };
    return null;
  });
}

/** Per-milestone validation: a missing or invalid date (warnings). */
export function milestoneIssues(milestones: ScheduleMilestone[]): (Issue | null)[] {
  return milestones.map((m) =>
    !m.date
      ? { code: "testPlan.schedule.missingDate", severity: "warning" }
      : !isIsoDay(m.date)
        ? { code: "testPlan.schedule.invalidDate", severity: "warning" }
        : null,
  );
}

/** Number of warnings the plan is saved with: sprint dates and repeated rows
 *  in its lists and tables. Shown in the save toast so they are not missed. */
export function planWarnings(f: FormState): number {
  const text = (v: string) => v;
  const pair = (a: string, b: string) => (a.trim() || b.trim() ? `${a.trim()} | ${b.trim()}` : "");
  return (
    sprintIssues(f.sprints, expectedSprintDays(f)).filter(Boolean).length +
    milestoneIssues(f.milestones).filter(Boolean).length +
    duplicateRows(f.sprints, (x) => x.name).size +
    duplicateRows(f.milestones, (x) => x.name).size +
    [f.scopeIn, f.scopeOut, f.phases, f.deliverables].reduce(
      (n, list) => n + duplicateRows(list, text).size,
      0,
    ) +
    duplicateRows(f.roles, (r) => pair(r.role, r.responsibility)).size +
    duplicateRows(f.risks, (r) => pair(r.risk, r.mitigation)).size +
    duplicateRows(f.closureCriteria, (c) => pair(c.criterion, c.metric)).size
  );
}

/** What the AI aids of the plan need to know about it (IA-10): title,
 *  summary, scope, types, levels and tools. */
export function planBrief(form: FormState): string {
  const list = (label: string, items: string[]) =>
    items.filter(Boolean).length ? `${label}: ${items.filter(Boolean).join(", ")}` : "";
  return [
    `Title: ${form.title}`,
    form.summary.trim() && `Summary: ${form.summary.trim()}`,
    list("In scope", form.scopeIn),
    list("Out of scope", form.scopeOut),
    list("Test types", form.testTypes),
    list("Test levels", form.testLevels),
    list("Tools", toolLabels(form.tools)),
    `Methodology: ${form.methodologyType}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function defaults(t: Translate): FormState {
  return {
    title: t("testPlan.defaultTitle"),
    version: "1.0",
    planDate: new Date().toISOString().slice(0, 10),
    status: "draft",
    summary: "",
    scopeIn: [],
    scopeOut: [],
    testTypes: [],
    methodologyType: "agile",
    sprintWeeks: 2,
    ceremonies: ["daily", "review", "retrospective"],
    ceremonyFrequency: frequenciesFor(["daily", "review", "retrospective"]),
    phases: [],
    testLevels: [],
    deliverables: [...DEFAULT_DELIVERABLES],
    environmentConfig: "",
    environmentRequirements: "",
    tools: [],
    automationStrategy: "",
    testDataManagement: "",
    defectManagement: "",
    roles: ROLE_KEYS.map((k) => ({ role: t(`testPlan.roleName.${k}`), responsibility: "" })),
    sprints: [],
    milestones: [],
    risks: [],
    communicationPlan: "",
    closureCriteria: [
      {
        criterion: t("testPlan.closureDefault.executed"),
        metric: t("testPlan.closureDefault.executedMetric"),
      },
      {
        criterion: t("testPlan.closureDefault.defects"),
        metric: t("testPlan.closureDefault.defectsMetric"),
      },
      {
        criterion: t("testPlan.closureDefault.coverage"),
        metric: t("testPlan.closureDefault.coverageMetric"),
      },
    ],
    purpose: "",
    conclusion: "",
    aiProvenance: {},
  };
}

/** Overwrites the content of `base` with a title and plan data (a revision or
 *  an import), keeping version/date/status (not snapshotted). `planId` gives
 *  legacy sprints and milestones their derived ids (null: random ones). */
export function applyRevision(
  base: FormState,
  title: string,
  d: TestPlanData,
  planId: string | null = null,
): FormState {
  const schedule = normalizeSchedule(planId, d);
  return {
    ...base,
    title,
    summary: d.summary ?? "",
    scopeIn: d.scopeIn ?? [],
    scopeOut: d.scopeOut ?? [],
    testTypes: d.testTypes ?? [],
    methodologyType: d.methodologyType ?? "agile",
    sprintWeeks: d.sprintWeeks ?? 2,
    ceremonies: d.ceremonies ?? [],
    ceremonyFrequency: frequenciesFor(d.ceremonies ?? [], d.ceremonyFrequency),
    phases: d.phases ?? [],
    testLevels: d.testLevels ?? [],
    deliverables: normalizeDeliverables(d.deliverables ?? []),
    environmentConfig: d.environmentConfig ?? "",
    environmentRequirements: d.environmentRequirements ?? "",
    tools: normalizeTools(d.tools ?? []),
    automationStrategy: d.automationStrategy ?? "",
    testDataManagement: d.testDataManagement ?? "",
    defectManagement: d.defectManagement ?? "",
    roles: d.roles ?? [],
    sprints: schedule.sprints,
    milestones: schedule.milestones,
    risks: d.risks ?? [],
    communicationPlan: d.communicationPlan ?? "",
    closureCriteria: d.closureCriteria ?? [],
    purpose: d.purpose ?? "",
    conclusion: d.conclusion ?? "",
    aiProvenance: d.aiProvenance ?? {},
  };
}

/** Builds a form from an imported plan input, reusing the defaults for any field
 *  the import did not detect (so undetected fields keep sensible defaults). */
export function fromInput(input: Omit<TestPlanInput, "userId">, t: Translate): FormState {
  const base = applyRevision(defaults(t), input.title, input.data);
  return {
    ...base,
    version: input.version ?? "1.0",
    planDate: input.planDate ?? "",
    status: input.status ?? "draft",
  };
}

export function fromPlan(p: TestPlan, t: Translate): FormState {
  return {
    ...applyRevision(defaults(t), p.title, p.data ?? {}, p.id),
    version: p.version,
    planDate: p.planDate ?? "",
    status: p.status,
  };
}

/** Bumps the last dotted segment of a version (`1.0` → `1.1`, `1.9` → `1.10`). */
export function nextVersion(v: string): string {
  const parts = v.split(".");
  const n = Number(parts[parts.length - 1]);
  if (!Number.isInteger(n)) return v;
  parts[parts.length - 1] = String(n + 1);
  return parts.join(".");
}

/** What is saved: blank rows are dropped, and editing bumps the version unless
 *  the user set it by hand (A2). */
export function toInput(
  form: FormState,
  opts: { plan: TestPlan | null; projectId: string | null; author: string; userId: string },
): TestPlanInput {
  const { plan } = opts;
  const clean = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
  const version = plan && form.version === plan.version ? nextVersion(form.version) : form.version;
  return {
    projectId: plan?.projectId ?? opts.projectId ?? null,
    title: form.title.trim(),
    version,
    planDate: form.planDate || null,
    status: form.status,
    author: opts.author,
    data: {
      summary: form.summary,
      scopeIn: clean(form.scopeIn),
      scopeOut: clean(form.scopeOut),
      testTypes: form.testTypes,
      methodologyType: form.methodologyType,
      sprintWeeks: form.sprintWeeks,
      ceremonies: form.ceremonies,
      ceremonyFrequency: frequenciesFor(form.ceremonies, form.ceremonyFrequency),
      phases: clean(form.phases),
      testLevels: form.testLevels,
      deliverables: clean(form.deliverables),
      environmentConfig: form.environmentConfig,
      environmentRequirements: form.environmentRequirements,
      tools: form.tools,
      automationStrategy: form.automationStrategy,
      testDataManagement: form.testDataManagement,
      defectManagement: form.defectManagement,
      roles: form.roles.filter((r) => r.role.trim() || r.responsibility.trim()),
      sprints: form.sprints.filter((s) => s.name.trim() || s.start || s.end),
      milestones: form.milestones.filter((m) => m.name.trim() || m.date),
      risks: form.risks.filter((r) => r.risk.trim() || r.mitigation.trim()),
      communicationPlan: form.communicationPlan,
      closureCriteria: form.closureCriteria.filter((c) => c.criterion.trim() || c.metric.trim()),
      purpose: form.purpose,
      conclusion: form.conclusion,
      aiProvenance: form.aiProvenance,
    },
    userId: opts.userId,
  };
}

/** Maps the current (possibly unsaved) form to the export shape, shared by the
 *  .xlsx and .pdf exporters so both stay in sync. */
export function toExportable(form: FormState, author: string, t: Translate): ExportablePlan {
  // Localize option lists (predefined keys → labels; custom values as-is).
  const loc = (arr: string[], known: string[], prefix: string) =>
    arr.map((k) => (known.includes(k) ? t(`${prefix}.${k}`) : k));
  return {
    filenameBase: form.title.trim() || "plan",
    version: form.version,
    planDate: form.planDate,
    author,
    status: t(`testPlan.statusLabel.${form.status}`),
    summary: form.summary,
    purpose: form.purpose,
    scopeIn: form.scopeIn,
    scopeOut: form.scopeOut,
    testTypes: loc(form.testTypes, TEST_TYPES, "testPlan.typeLabel"),
    methodology: methodologyText(form, t),
    testLevels: loc(form.testLevels, TEST_LEVELS, "testPlan.levelLabel"),
    deliverables: deliverableLabels(form.deliverables, t),
    environmentConfig: form.environmentConfig,
    environmentRequirements: form.environmentRequirements,
    tools: toolLabels(form.tools),
    automationStrategy: form.automationStrategy,
    testDataManagement: form.testDataManagement,
    defectManagement: form.defectManagement,
    communicationPlan: form.communicationPlan,
    conclusion: form.conclusion,
    roles: form.roles.filter((r) => r.role.trim() || r.responsibility.trim()),
    sprints: form.sprints
      .filter((s) => s.name.trim() || s.start || s.end)
      .map((s) => ({ name: s.name, range: [s.start, s.end].filter(Boolean).join(" → ") })),
    risks: form.risks.filter((r) => r.risk.trim() || r.mitigation.trim()),
    closureCriteria: form.closureCriteria.filter((c) => c.criterion.trim() || c.metric.trim()),
  };
}
