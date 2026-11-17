// The plan wizard's form (spec §5.1): its shape, how it is built from a plan,
// an import or a revision, and how it becomes what is saved and exported.
// Pure functions, moved out of TestPlanWizard (RED-V2).
import type { ProvenanceMap } from "@modules/ai";
import { duplicateRows, type Issue } from "@shared/validation";
import type { ExportablePlan } from "../../export/planXlsx";
import type {
  ClosureCriterion,
  Estimation,
  IndependenceLevel,
  PlanApproval,
  PlanMetric,
  TrainingItem,
  RiskItem,
  RoleItem,
  ScheduleMilestone,
  ScheduleSprint,
  TestPlan,
  TestPlanData,
  TestPlanInput,
} from "../../model/types";
import { DEFAULT_DELIVERABLES, INDEPENDENCE_LEVELS, ROLE_KEYS } from "../../model/catalogs";
import { DEFAULT_METRICS, METRIC_UNIT, linkedText, newMetricId, normalizeMetrics } from "../../model/metrics";
import { strategyExport } from "../../export/planStrategy";
import {
  deliverableLabels,
  levelLabels,
  normalizeDeliverables,
  normalizeTools,
  toolLabels,
  typeGroupLines,
  typeLabels,
} from "../../model/catalogLabels";
import {
  frequenciesFor,
  methodologyLines,
  methodologyText,
} from "../../model/methodology";
import {
  isIsoDay,
  normalizeSchedule,
  overlaps,
  sprintDays,
} from "../../model/schedule";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

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
  // ISO/IEC/IEEE 29119-3 and CTFL v4 §5.1.1 (PLN-06).
  assumptions: string[];
  constraints: string[];
  techniques: string[];
  /** "" until one is chosen. */
  independence: IndependenceLevel | "";
  independenceNote: string;
  training: TrainingItem[];
  estimation: Estimation;
  entryCriteria: string[];
  suspensionCriteria: string[];
  resumptionCriteria: string[];
  metrics: PlanMetric[];
  /** The document's identifier (PLN-04). */
  documentId: string;
  /** Who approved it and when, while «Aprobado» (PLN-07). */
  approval: PlanApproval | null;
  /** AI provenance of the assisted fields (IA-01). */
  aiProvenance: ProvenanceMap;
}

/** The lists the AI can fill in the new steps (PLN-06). */
export type PlanListField =
  | "assumptions"
  | "constraints"
  | "entryCriteria"
  | "suspensionCriteria"
  | "resumptionCriteria";

/** Fields the wizard can draft with AI (keys of the provenance map). */
export type AssistedField =
  | "summary"
  | "environmentConfig"
  | "environmentRequirements"
  | "automationStrategy"
  | "testDataManagement"
  | "defectManagement"
  | "communicationPlan"
  | "purpose"
  | "conclusion";
/** Assisted fields plus the lists the AI can fill (IA-10, IA-13, IA-14). */
export type ReviewableField =
  | AssistedField
  | "risks"
  | "roles"
  | "closureCriteria"
  | "assumptionsConstraints"
  | "entrySuspension";

/** The roles the AI can suggest a responsibility for: written, and still without one. */
export function rolesWithoutResponsibility(roles: FormState["roles"]): string[] {
  return roles.filter((r) => r.role.trim() && !r.responsibility.trim()).map((r) => r.role.trim());
}

/** Fills the responsibility of those roles and nothing else: a row written in the
 *  meantime and the roles themselves stay as they are (pure — testable). */
export function withResponsibilities(
  roles: FormState["roles"],
  items: { role: string; responsibility: string }[],
): FormState["roles"] {
  const found = new Map(items.map((i) => [i.role, i.responsibility]));
  return roles.map((r) =>
    r.responsibility.trim() ? r : { ...r, responsibility: found.get(r.role.trim()) ?? r.responsibility },
  );
}

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
    duplicateRows(f.closureCriteria, (c) => pair(c.criterion, c.metric)).size +
    [f.assumptions, f.constraints, f.entryCriteria, f.suspensionCriteria, f.resumptionCriteria].reduce(
      (n, list) => n + duplicateRows(list, text).size,
      0,
    ) +
    duplicateRows(f.training, (r) => pair(r.need, r.when)).size
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

/** The plan's brief plus its risks, which exit criteria should answer to (IA-14). */
export function closureBrief(form: FormState): string {
  const risks = form.risks.map((r) => r.risk.trim()).filter(Boolean);
  return [planBrief(form), risks.length ? `Risks: ${risks.join("; ")}` : ""].filter(Boolean).join("\n");
}

/** All a conclusion is judged against: the plan, its risks and its exit criteria (IA-15). */
export function conclusionBrief(form: FormState): string {
  const criteria = form.closureCriteria
    .filter((c) => c.criterion.trim())
    .map((c) => (c.metric.trim() ? `${c.criterion.trim()} (${c.metric.trim()})` : c.criterion.trim()));
  return [closureBrief(form), criteria.length ? `Exit criteria: ${criteria.join("; ")}` : ""].filter(Boolean).join("\n");
}

/** Six upper-case hex digits: the first ones of a plan id, or random for
 *  a plan not saved yet. */
export function hexOf(id: string | null | undefined): string {
  const hex = (id ?? "").replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
  if (hex.length === 6) return hex;
  return Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16))
    .join("")
    .toUpperCase();
}

/** The default document ID (PLN-04): `TP-<prefix>-<6 hex>`, with the
 *  project's case prefix without its separators (`PH-` → `PH`), or
 *  `TP-<6 hex>` without one. */
export function documentIdFor(prefix: string | null | undefined, hex: string): string {
  const p = (prefix ?? "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  return p ? `TP-${p}-${hex}` : `TP-${hex}`;
}

/** The starting metrics and the exit criteria they measure (PLN-06): the
 *  A3 criteria of before, now linked to their metric. */
function defaultMetrics(t: Translate, lang: string): Pick<FormState, "metrics" | "closureCriteria"> {
  const metrics: PlanMetric[] = [];
  const closureCriteria: ClosureCriterion[] = [];
  for (const d of DEFAULT_METRICS) {
    const m: PlanMetric = {
      id: newMetricId(metrics),
      kind: d.kind,
      name: "",
      op: d.op,
      target: d.target,
      unit: METRIC_UNIT[d.kind],
    };
    metrics.push(m);
    if (d.exit) closureCriteria.push({ ...linkedText(m, t, lang), metricId: m.id, blocking: true });
  }
  return { metrics, closureCriteria };
}

/** A new plan's fields. Its title is a suggestion from the project's name
 *  («Plan de pruebas Wallet Bancaria», UX-34), editable like any other. */
export function defaults(
  t: Translate,
  projectName?: string,
  opts: { prefix?: string | null; lang?: string } = {},
): FormState {
  const name = projectName?.trim();
  const starting = defaultMetrics(t, opts.lang ?? "es");
  return {
    title: name ? t("testPlan.suggestedTitle", { project: name }) : t("testPlan.defaultTitle"),
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
    closureCriteria: starting.closureCriteria,
    purpose: "",
    conclusion: "",
    assumptions: [],
    constraints: [],
    techniques: [],
    independence: "",
    independenceNote: "",
    training: [],
    estimation: {},
    entryCriteria: [],
    suspensionCriteria: [],
    resumptionCriteria: [],
    metrics: starting.metrics,
    documentId: documentIdFor(opts.prefix, hexOf(null)),
    approval: null,
    aiProvenance: {},
  };
}

const isIndependence = (v: unknown): v is IndependenceLevel =>
  typeof v === "string" && (INDEPENDENCE_LEVELS as readonly string[]).includes(v);

/** Overwrites the content of `base` with a title and plan data (a revision or
 *  an import), keeping version/date/status, the document ID and the approval
 *  (the document's identification, not its content). `planId` gives
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
    assumptions: d.assumptions ?? [],
    constraints: d.constraints ?? [],
    techniques: d.techniques ?? [],
    independence: isIndependence(d.independence) ? d.independence : "",
    independenceNote: d.independenceNote ?? "",
    training: d.training ?? [],
    estimation: d.estimation ?? {},
    entryCriteria: d.entryCriteria ?? [],
    suspensionCriteria: d.suspensionCriteria ?? [],
    resumptionCriteria: d.resumptionCriteria ?? [],
    metrics: normalizeMetrics(d.metrics),
    aiProvenance: d.aiProvenance ?? {},
  };
}

/** Builds a form from an imported plan input, reusing the defaults for any field
 *  the import did not detect (so undetected fields keep sensible defaults). */
export function fromInput(
  input: Omit<TestPlanInput, "userId">,
  t: Translate,
  keep?: Pick<FormState, "documentId">,
): FormState {
  const base = applyRevision(defaults(t), input.title, input.data);
  // A file never brings an approval: an «Aprobado» plan comes in as
  // «Revisado», to be approved here (PLN-07).
  const status = input.status ?? "draft";
  return {
    ...base,
    version: input.version ?? "1.0",
    planDate: input.planDate ?? "",
    status: status === "approved" ? "reviewed" : status,
    documentId: input.data.documentId?.trim() || keep?.documentId || base.documentId,
    approval: null,
  };
}

/** The form of a saved plan. `prefix` is the project's case prefix, for the
 *  default document ID of a plan saved before PLN-04. */
export function fromPlan(p: TestPlan, t: Translate, prefix?: string | null): FormState {
  const d = p.data ?? {};
  return {
    ...applyRevision(defaults(t), p.title, d, p.id),
    version: p.version,
    planDate: p.planDate ?? "",
    status: p.status,
    documentId: d.documentId?.trim() || documentIdFor(prefix, hexOf(p.id)),
    approval: p.status === "approved" ? (d.approval ?? null) : null,
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

const clean = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
const positive = (n: number | undefined) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;

/** The estimation as saved: only the figures its technique uses. */
export function cleanEstimation(e: Estimation): Estimation {
  const out: Estimation = {};
  if (e.technique) out.technique = e.technique;
  if (e.technique === "threePoint") {
    const o = positive(e.optimistic);
    const m = positive(e.likely);
    const p = positive(e.pessimistic);
    if (o !== undefined) out.optimistic = o;
    if (m !== undefined) out.likely = m;
    if (p !== undefined) out.pessimistic = p;
  } else {
    const effort = positive(e.effort);
    if (effort !== undefined) out.effort = effort;
  }
  if (e.budget?.trim()) out.budget = e.budget.trim();
  if (e.notes?.trim()) out.notes = e.notes;
  return out;
}

/** The plan's content as saved: blank rows dropped (no version, status,
 *  document ID or approval). */
export function toData(form: FormState): TestPlanData {
  const metrics = form.metrics
    .filter((m) => m.kind || m.name.trim())
    .map(({ note, ...m }) => (note?.trim() ? { ...m, note } : m));
  const metricIds = new Set(metrics.map((m) => m.id));
  return {
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
    closureCriteria: form.closureCriteria
      .filter((c) => c.criterion.trim() || c.metric.trim())
      .map((c) => {
        // A link to a metric no longer in the plan is dropped.
        if (!c.metricId || metricIds.has(c.metricId)) return c;
        const { metricId: _gone, ...rest } = c;
        return rest;
      }),
    purpose: form.purpose,
    conclusion: form.conclusion,
    assumptions: clean(form.assumptions),
    constraints: clean(form.constraints),
    techniques: form.techniques,
    ...(form.independence ? { independence: form.independence } : {}),
    independenceNote: form.independenceNote,
    training: form.training.filter((r) => r.need.trim() || r.when.trim()),
    estimation: cleanEstimation(form.estimation),
    entryCriteria: clean(form.entryCriteria),
    suspensionCriteria: clean(form.suspensionCriteria),
    resumptionCriteria: clean(form.resumptionCriteria),
    metrics,
    aiProvenance: form.aiProvenance,
  };
}

/** JSON with sorted keys, so two copies of the same content compare equal. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  );
}

/** The title and content that make a new version (PLN-03): not the status,
 *  date, document ID, approval or the review marks of AI drafts. */
export function contentKey(form: FormState): string {
  const { aiProvenance: _ai, ...data } = toData(form);
  return canonical({ title: form.title.trim(), data });
}

const keepT: Translate = (key) => key;

/** Whether the form changes the saved plan's title or content (PLN-03). */
export function changesContent(form: FormState, plan: TestPlan | null): boolean {
  return !plan || contentKey(form) !== contentKey(fromPlan(plan, keepT));
}

/** What is saved (A2, PLN-03, PLN-07): blank rows are dropped; the version
 *  goes up only when the title or content changes (and the user did not set
 *  it by hand); changing the content of an approved plan sends it back to
 *  «Revisado» and drops its approval, which only an «Aprobado» plan keeps. */
export function toInput(
  form: FormState,
  opts: { plan: TestPlan | null; projectId: string | null; author: string; userId: string },
): TestPlanInput {
  const { plan } = opts;
  const changed = changesContent(form, plan);
  const version =
    plan && changed && form.version === plan.version ? nextVersion(form.version) : form.version;
  const status =
    plan?.status === "approved" && form.status === "approved" && changed ? "reviewed" : form.status;
  return {
    projectId: plan?.projectId ?? opts.projectId ?? null,
    title: form.title.trim(),
    version,
    planDate: form.planDate || null,
    status,
    author: opts.author,
    data: {
      ...toData(form),
      documentId: form.documentId.trim(),
      approval: status === "approved" ? form.approval : null,
    },
    userId: opts.userId,
  };
}

/** Maps the current (possibly unsaved) form to the export shape, shared by the
 *  .xlsx and .pdf exporters so both stay in sync. */
export function toExportable(form: FormState, author: string, t: Translate, lang = "es"): ExportablePlan {
  return {
    ...strategyExport(toData(form), t, lang),
    documentId: form.documentId.trim(),
    approvedBy: form.status === "approved" && form.approval ? approvalLine(form.approval, t, lang) : "",
    filenameBase: form.title.trim() || "plan",
    version: form.version,
    planDate: form.planDate,
    author,
    status: t(`testPlan.statusLabel.${form.status}`),
    summary: form.summary,
    purpose: form.purpose,
    scopeIn: form.scopeIn,
    scopeOut: form.scopeOut,
    // By the step's groups, own entries last (UX-31).
    testTypes: typeLabels(form.testTypes, t),
    testTypeLines: typeGroupLines(form.testTypes, t),
    methodology: methodologyText(form, t),
    methodologyLines: methodologyLines(form, t),
    testLevels: levelLabels(form.testLevels, t),
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

/** «Liomar Rodríguez · 11 nov 2026» for the exports' header (PLN-07). */
export function approvalLine(a: PlanApproval, t: Translate, lang: string): string {
  const at = new Date(a.at);
  const date = Number.isNaN(at.getTime())
    ? a.at
    : new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(at);
  return t("testPlan.approval.byLine", { name: a.byName, date });
}
