import { projectApi, type ProjectSummary } from "@modules/projects";
import { planClosure, projectPlanClosure } from "@modules/test-plan";
import { isTauri } from "@shared/platform";
import { projectKey, type HomeProject } from "./homeData";

type Closure = ReturnType<typeof planClosure> | null;

const homeProject = (p: ProjectSummary, closure: Closure): HomeProject => ({
  id: p.id,
  name: p.name,
  key: projectKey(p.caseIdPrefix),
  closeDate: closure?.closeDate ?? null,
  hasPlan: closure !== null,
  criteria: closure?.criteria ?? [],
});

const latestFirst = (a: ProjectSummary, b: ProjectSummary) => b.updatedAt.localeCompare(a.updatedAt);

/** Reads what the Home shows besides the execution numbers (read-only), each
 *  project with its plan's closing date and criteria, most recently updated
 *  first. The web gets them in one read of the server (ADR-0035); the desktop
 *  asks its local store project by project. Cases, results and defects come
 *  from the metrics read (`loadHomeMetrics`). */
export async function loadHome(ownerId: string): Promise<HomeProject[]> {
  if (!isTauri()) {
    return (await projectApi.webOverview())
      .sort(latestFirst)
      .map((p) => homeProject(p, p.plan ? planClosure(p.plan.data) : null));
  }
  const projects = [...(await projectApi.list(ownerId))].sort(latestFirst);
  return Promise.all(
    projects.map(async (p) => homeProject(p, await projectPlanClosure(p.id, ownerId))),
  );
}
