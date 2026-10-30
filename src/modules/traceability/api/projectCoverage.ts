import { projectTraceableCases } from "@modules/test-cases";
import { buildMatrix } from "../model/matrix";
import { requirementApi } from "./requirementApi";

/** Share (0..1) of a project's requirements covered by at least one case that
 *  is not obsolete, by the same rule as the matrix (TRZ-02); `null` when the
 *  project has no requirements, so there is nothing to cover. Defects do not
 *  change coverage, so they are not read. */
export async function projectCoverage(projectId: string, ownerId: string): Promise<number | null> {
  const [requirements, cases] = await Promise.all([
    requirementApi.list(projectId, ownerId),
    projectTraceableCases(projectId, ownerId),
  ]);
  if (requirements.length === 0) return null;
  return buildMatrix(requirements, cases, []).summary.coverageRatio;
}
