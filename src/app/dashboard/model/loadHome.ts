import { projectApi, projectOverview } from "@modules/projects";
import { projectLiveCases } from "@modules/test-cases";
import { projectPlanClosure } from "@modules/test-plan";
import { projectDefects } from "@modules/planner";
import { projectKey, type HomeProject } from "./homeData";

/** Reads everything the Home shows, per project and most recent first
 *  (read-only; the same order as the Projects list). */
export async function loadHome(ownerId: string): Promise<HomeProject[]> {
  const [overview, summaries] = await Promise.all([
    projectOverview(ownerId),
    projectApi.list(ownerId),
  ]);
  const prefix = new Map(summaries.map((s) => [s.id, s.caseIdPrefix]));
  return Promise.all(
    overview.map(async (p): Promise<HomeProject> => {
      const [cases, closure, defects] = await Promise.all([
        projectLiveCases(p.id, ownerId),
        projectPlanClosure(p.id, ownerId),
        projectDefects(p.id, ownerId),
      ]);
      const open = defects.filter((d) => d.status !== "done");
      return {
        id: p.id,
        name: p.name,
        key: projectKey(prefix.get(p.id) ?? ""),
        recency: p.lastAccess ?? p.updatedAt,
        cases: cases.map((c) => ({
          id: c.id,
          scenarioId: c.scenarioId,
          title: c.title,
          priority: c.priority,
        })),
        closeDate: closure?.closeDate ?? null,
        hasPlan: closure !== null,
        criteria: closure?.criteria ?? [],
        openDefects: open.length,
        criticalDefects: open.filter((d) => d.priority === "critical").length,
      };
    }),
  );
}
