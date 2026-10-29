// Data for the Home list (spec §5, UX-08): every project of the user with its
// last access, plan status and progress, most recently used first.
import { projectPlanStatus } from "@modules/test-plan";
import { projectCaseProgress } from "@modules/test-cases";
import { projectApi } from "../api/projectApi";
import { lastAccessMap } from "./lastAccess";

export interface ProjectOverview {
  id: string;
  name: string;
  /** Last time this user opened it on this device (null = never). */
  lastAccess: string | null;
  updatedAt: string;
  /** Plan status key (draft, reviewed, approved, obsolete) or null without plan. */
  planStatus: string | null;
  /** Approved cases out of the cases that are not obsolete. */
  approved: number;
  total: number;
}

/** Progress in percent (0 with no cases). Execution progress arrives with the
 *  run model (0.2.0); until then progress is how much of the suite is approved. */
export const progressPercent = (
  p: Pick<ProjectOverview, "approved" | "total">,
): number => (p.total ? Math.round((p.approved / p.total) * 100) : 0);

/** Most recently used first: last access, else last update. */
const recency = (p: ProjectOverview) => p.lastAccess ?? p.updatedAt;

export async function projectOverview(
  ownerId: string,
): Promise<ProjectOverview[]> {
  const access = lastAccessMap(ownerId);
  const projects = await projectApi.list(ownerId);
  const rows = await Promise.all(
    projects.map(async (p): Promise<ProjectOverview> => {
      const [planStatus, progress] = await Promise.all([
        projectPlanStatus(p.id, ownerId),
        projectCaseProgress(p.id, ownerId),
      ]);
      return {
        id: p.id,
        name: p.name,
        lastAccess: access[p.id] ?? null,
        updatedAt: p.updatedAt,
        planStatus,
        ...progress,
      };
    }),
  );
  return rows.sort((a, b) => recency(b).localeCompare(recency(a)));
}

/** Case-insensitive, accent-insensitive name match for the Home search. */
export function matchesQuery(name: string, query: string): boolean {
  const fold = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return fold(name).includes(fold(query.trim()));
}
