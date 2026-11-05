import { projectApi } from "@modules/projects";
import { projectPlanClosure } from "@modules/test-plan";
import { projectKey, type HomeProject } from "./homeData";

/** Reads what the Home shows besides the execution numbers (read-only): one
 *  project list, then one read per project, its plan's closing date and
 *  criteria. Cases, results and defects come from the metrics read
 *  (`loadHomeMetrics`), so the web makes no per-project case or defect calls.
 *  Projects come most recently updated first. */
export async function loadHome(ownerId: string): Promise<HomeProject[]> {
  const projects = [...(await projectApi.list(ownerId))].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  return Promise.all(
    projects.map(async (p): Promise<HomeProject> => {
      const closure = await projectPlanClosure(p.id, ownerId);
      return {
        id: p.id,
        name: p.name,
        key: projectKey(p.caseIdPrefix),
        closeDate: closure?.closeDate ?? null,
        hasPlan: closure !== null,
        criteria: closure?.criteria ?? [],
      };
    }),
  );
}
