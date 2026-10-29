import type { TestPlan } from "../model/types";
import { TEST_LEVELS, TEST_TYPES, TOOLS } from "../model/catalogs";
import { methodologyText } from "../model/methodology";
import { testPlanApi } from "../api/testPlanApi";
import { buildPlanXlsx, type ExportablePlan } from "./planXlsx";
import { buildPlanPdf, planPdfName } from "./planPdf";

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
    testLevels: loc(d.testLevels, TEST_LEVELS, "testPlan.levelLabel", t),
    deliverables: d.deliverables ?? [],
    environmentConfig: d.environmentConfig ?? "",
    environmentRequirements: d.environmentRequirements ?? "",
    tools: loc(d.tools, TOOLS, "testPlan.toolLabel", t),
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
 *  spec §5.4. `onEach` fires with each file name as it is built (progress). */
export async function projectPlanFiles(
  projectId: string,
  userId: string,
  t: Translate,
  lang: string,
  onEach?: (name: string) => void,
): Promise<{ name: string; buffer: ArrayBuffer | Uint8Array }[]> {
  const plan = await testPlanApi.byProject(projectId, userId);
  if (!plan) return [];
  const exportable = planToExportable(plan, t);
  const { filename, buffer } = await buildPlanXlsx(exportable, lang);
  onEach?.(filename);
  const pdfName = planPdfName(exportable);
  const pdf = await buildPlanPdf(exportable, t);
  onEach?.(pdfName);
  return [
    { name: filename, buffer },
    { name: pdfName, buffer: pdf },
  ];
}
