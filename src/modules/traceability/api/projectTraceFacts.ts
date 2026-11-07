import { projectTraceableCases } from "@modules/test-cases";
import { buildMatrix } from "../model/matrix";
import { requirementApi } from "./requirementApi";

/** A project's row in Proyectos, from one read of its cases and one of its
 *  requirements (FIX-20): how many cases it has and the share (0..1) of its
 *  requirements covered by at least one case that is not obsolete, by the same
 *  rule as the matrix (TRZ-02). `coverage` is `null` when the project has no
 *  requirements, so there is nothing to cover. Defects do not change coverage,
 *  so they are not read. */
export async function projectTraceFacts(
  projectId: string,
  ownerId: string,
): Promise<{ cases: number; coverage: number | null }> {
  const [requirements, cases] = await Promise.all([
    requirementApi.list(projectId, ownerId),
    projectTraceableCases(projectId, ownerId),
  ]);
  return {
    cases: cases.length,
    coverage:
      requirements.length === 0 ? null : buildMatrix(requirements, cases, []).summary.coverageRatio,
  };
}
