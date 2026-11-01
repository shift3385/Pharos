import { projectApi } from "@modules/projects";
import { projectLiveCases } from "@modules/test-cases";
import { projectPlanClosure } from "@modules/test-plan";
import { isOpenDefect, projectDefects } from "@modules/defects";
import { projectKey, type HomeProject } from "./homeData";

/** Reads everything the Home shows (read-only): one project list, then three
 *  reads per project (live cases, plan closure, defects). Projects
 *  come most recently updated first. */
export async function loadHome(ownerId: string): Promise<HomeProject[]> {
  const projects = [...(await projectApi.list(ownerId))].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  return Promise.all(
    projects.map(async (p): Promise<HomeProject> => {
      const [cases, closure, defects] = await Promise.all([
        projectLiveCases(p.id, ownerId),
        projectPlanClosure(p.id, ownerId),
        projectDefects(p.id, ownerId),
      ]);
      // Open: not closed nor rejected (ADR-0016); critical is the severity,
      // the impact on the system, not the urgency of the fix.
      const open = defects.filter((d) => isOpenDefect(d.status));
      return {
        id: p.id,
        name: p.name,
        key: projectKey(p.caseIdPrefix),
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
        criticalDefects: open.filter((d) => d.severity === "critical").length,
      };
    }),
  );
}
