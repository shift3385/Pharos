import type { TestPlan } from "../model/types";
import { CEREMONIES, TEST_LEVELS, TEST_TYPES, TOOLS } from "../model/catalogs";
import { testPlanApi } from "../api/testPlanApi";
import { buildPlanXlsx, type ExportablePlan } from "./planXlsx";

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
  const methodology =
    (d.methodologyType ?? "agile") === "agile"
      ? `${t("testPlan.agile")} · ${t("testPlan.sprintWeeks")}: ${d.sprintWeeks ?? ""} · ` +
        `${t("testPlan.ceremonies")}: ${loc(d.ceremonies, CEREMONIES, "testPlan.ceremonyLabel", t).join(", ")}`
      : `${t("testPlan.traditional")} · ${t("testPlan.phases")}: ${(d.phases ?? [])
          .filter((p) => p.trim())
          .join(", ")}`;
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
export async function projectHasPlan(projectId: string): Promise<boolean> {
  return (await testPlanApi.byProject(projectId)) != null;
}

/** Version of a project’s plan (null when it has none), e.g. for the version
 *  of documents derived from the plan such as the traceability matrix. */
export async function projectPlanVersion(projectId: string): Promise<string | null> {
  return (await testPlanApi.byProject(projectId))?.version ?? null;
}

/** Builds the plan .xlsx buffer for a project (null if it has no plan). */
export async function planWorkbookByProject(
  projectId: string,
  t: Translate,
  lang: string,
): Promise<{ name: string; buffer: ArrayBuffer } | null> {
  const plan = await testPlanApi.byProject(projectId);
  if (!plan) return null;
  const { filename, buffer } = await buildPlanXlsx(planToExportable(plan, t), lang);
  return { name: filename, buffer };
}
