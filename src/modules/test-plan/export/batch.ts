import type { ClosureCriterion, TestPlan } from "../model/types";
import { TEST_LEVELS, TEST_TYPES } from "../model/catalogs";
import { deliverableLabels, toolLabels } from "../model/catalogLabels";
import { methodologyLines, methodologyText } from "../model/methodology";
import { testPlanApi } from "../api/testPlanApi";
import { buildPlanXlsx, type ExportablePlan } from "./planXlsx";
import { buildPlanPdf, planPdfName } from "./planPdf";
import type { CycleExportData } from "@modules/cycles";
import { planExtraTables } from "./planExtras";
import { loadHistoryTable } from "./planHistory";

/** The project asks for the revision history in its plan (PLN-02):
 *  `names` maps account ids to official names (first and last name). */
export interface PlanHistoryOption {
  names: Record<string, string>;
  /** Time zone of the days; the exporter's own when absent (tests). */
  timeZone?: string;
}

type Translate = (key: string) => string;

const loc = (
  arr: string[] | undefined,
  known: string[],
  prefix: string,
  t: Translate,
) => (arr ?? []).map((k) => (known.includes(k) ? t(`${prefix}.${k}`) : k));

/** Maps a stored plan to the export shape (mirrors the wizard's export mapping),
 *  localizing option lists and composing the methodology line. */
export function planToExportable(plan: TestPlan, t: Translate): ExportablePlan {
  const d = plan.data ?? {};
  const methodology = methodologyText(d, t);
  return {
    filenameBase: plan.title?.trim() || "plan",
    version: plan.version,
    planDate: plan.planDate ?? "",
    author: plan.author,
    status: t(`testPlan.statusLabel.${plan.status}`),
    summary: d.summary ?? "",
    purpose: d.purpose ?? "",
    scopeIn: d.scopeIn ?? [],
    scopeOut: d.scopeOut ?? [],
    testTypes: loc(d.testTypes, TEST_TYPES, "testPlan.typeLabel", t),
    methodology,
    methodologyLines: methodologyLines(d, t),
    testLevels: loc(d.testLevels, TEST_LEVELS, "testPlan.levelLabel", t),
    deliverables: deliverableLabels(d.deliverables, t),
    environmentConfig: d.environmentConfig ?? "",
    environmentRequirements: d.environmentRequirements ?? "",
    tools: toolLabels(d.tools),
    automationStrategy: d.automationStrategy ?? "",
    testDataManagement: d.testDataManagement ?? "",
    defectManagement: d.defectManagement ?? "",
    communicationPlan: d.communicationPlan ?? "",
    conclusion: d.conclusion ?? "",
    roles: (d.roles ?? []).filter((r) => r.role.trim() || r.responsibility.trim()),
    sprints: (d.sprints ?? [])
      .filter((s) => s.name.trim() || s.start || s.end)
      .map((s) => ({ name: s.name, range: [s.start, s.end].filter(Boolean).join(" → ") })),
    risks: (d.risks ?? []).filter((r) => r.risk.trim() || r.mitigation.trim()),
    closureCriteria: (d.closureCriteria ?? []).filter(
      (c) => c.criterion.trim() || c.metric.trim(),
    ),
  };
}

/** Whether a project has a plan (cheap query for progress totals). */
export async function projectHasPlan(projectId: string, userId: string): Promise<boolean> {
  return (await testPlanApi.byProject(projectId, userId)) != null;
}

/** Status of a project’s plan (null when it has none), for the Home list. */
export async function projectPlanStatus(
  projectId: string,
  userId: string,
): Promise<string | null> {
  return (await testPlanApi.byProject(projectId, userId))?.status ?? null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The latest sprint end or milestone of a plan's schedule (null when it has
 *  none). Only ISO dates (YYYY-MM-DD) compare as text; an imported plan may keep
 *  the raw cell text («14/11/2026», «Nov 28»), which is ignored here. */
function planCloseDate(plan: TestPlan): string | null {
  const dates = [
    ...(plan.data.sprints ?? []).map((s) => s.end),
    ...(plan.data.milestones ?? []).map((m) => m.date),
  ].filter((d) => ISO_DAY.test(d ?? ""));
  return dates.length ? dates.reduce((a, b) => (b > a ? b : a)) : null;
}

/** Closing date and exit criteria of a project’s plan, for the Home (RED-V1);
 *  null when the project has no plan. Read-only. */
export async function projectPlanClosure(
  projectId: string,
  userId: string,
): Promise<{ closeDate: string | null; criteria: ClosureCriterion[] } | null> {
  const plan = await testPlanApi.byProject(projectId, userId);
  if (!plan) return null;
  const criteria = (plan.data.closureCriteria ?? []).filter((c) => c.criterion.trim());
  return { closeDate: planCloseDate(plan), criteria };
}

/** Status and closing date of a project’s plan from one read, for Proyectos and
 *  the project header (FIX-20); null when the project has no plan. */
export async function projectPlanOverview(
  projectId: string,
  userId: string,
): Promise<{ status: string; closeDate: string | null } | null> {
  const plan = await testPlanApi.byProject(projectId, userId);
  return plan ? { status: plan.status, closeDate: planCloseDate(plan) } : null;
}

/** Id, title and version of a project’s plan (null when it has none): the
 *  status report (EJE-03) scopes by it and names it. */
export async function projectPlanRef(
  projectId: string,
  userId: string,
): Promise<{ id: string; title: string; version: string } | null> {
  const plan = await testPlanApi.byProject(projectId, userId);
  return plan ? { id: plan.id, title: plan.title, version: plan.version } : null;
}

/** Version of a project’s plan (null when it has none), e.g. for the version
 *  of documents derived from the plan such as the traceability matrix. */
export async function projectPlanVersion(
  projectId: string,
  userId: string,
): Promise<string | null> {
  return (await testPlanApi.byProject(projectId, userId))?.version ?? null;
}

/** Files exported for a plan in the batch ZIP: its .xlsx and its .pdf (EXP-02). */
export const FILES_PER_PLAN = 2;

/** Builds the plan .xlsx and .pdf for a project (empty if it has no plan),
 *  spec §5.4. `onEach` fires with each file name as it is built (progress).
 *  A PDF that cannot be rendered is left out and passed to `onSkip`. With
 *  `history`, both files carry the plan's «Historial de revisiones». */
export async function projectPlanFiles(
  projectId: string,
  userId: string,
  t: Translate,
  lang: string,
  onEach?: (name: string) => void,
  onSkip?: (name: string) => void,
  cycles?: CycleExportData,
  history?: PlanHistoryOption,
): Promise<{ name: string; buffer: ArrayBuffer | Uint8Array }[]> {
  const plan = await testPlanApi.byProject(projectId, userId);
  if (!plan) return [];
  const exportable = {
    ...planToExportable(plan, t),
    extraTables: await planExtraTables(
      projectId,
      userId,
      plan.data.milestones,
      t,
      lang,
      cycles,
    ),
    ...(history
      ? { history: (await loadHistoryTable(plan, userId, history.names, t, history.timeZone)) ?? undefined }
      : {}),
  };
  const { filename, buffer } = await buildPlanXlsx(exportable, lang);
  onEach?.(filename);
  const files: { name: string; buffer: ArrayBuffer | Uint8Array }[] = [
    { name: filename, buffer },
  ];
  const pdfName = planPdfName(exportable);
  try {
    files.push({ name: pdfName, buffer: await buildPlanPdf(exportable, t) });
  } catch {
    onSkip?.(pdfName);
  }
  onEach?.(pdfName);
  return files;
}
