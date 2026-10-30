// Rows of the Proyectos screen: every project of the user with what the table
// shows. The projects module composes the other modules' public APIs.
import { projectPlanStatus } from "@modules/test-plan";
import { projectCaseCount } from "@modules/test-cases";
import { projectCoverage } from "@modules/traceability";
import { projectApi } from "../api/projectApi";
import { lastAccessMap } from "./lastAccess";
import type { ProjectRow } from "./projectTable";

export async function projectRows(ownerId: string): Promise<ProjectRow[]> {
  const access = lastAccessMap(ownerId);
  const projects = await projectApi.list(ownerId);
  return Promise.all(
    projects.map(async (p): Promise<ProjectRow> => {
      const [planStatus, cases, coverage] = await Promise.all([
        projectPlanStatus(p.id, ownerId),
        projectCaseCount(p.id, ownerId),
        projectCoverage(p.id, ownerId),
      ]);
      return {
        id: p.id,
        name: p.name,
        caseIdPrefix: p.caseIdPrefix,
        caseIdDigits: p.caseIdDigits,
        updatedAt: p.updatedAt,
        lastAccess: access[p.id] ?? null,
        planStatus,
        cases,
        coverage,
        closeDate: null,
      };
    }),
  );
}
