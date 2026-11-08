// Rows of the Proyectos screen: every project of the user with what the table
// shows. The projects module composes the other modules' public APIs.
import { projectPlanOverview } from "@modules/test-plan";
import { projectTraceFacts } from "@modules/traceability";
import { parseStamp } from "@shared/time/stamp";
import { projectApi } from "../api/projectApi";
import { lastAccessMap } from "./lastAccess";
import type { ProjectRow } from "./projectTable";

export async function projectRows(ownerId: string): Promise<ProjectRow[]> {
  const access = lastAccessMap(ownerId);
  const projects = await projectApi.list(ownerId);
  return Promise.all(
    projects.map(async (p): Promise<ProjectRow> => {
      // Three reads per project: its plan, its cases and its requirements (FIX-20).
      const [plan, { cases, coverage }] = await Promise.all([
        projectPlanOverview(p.id, ownerId),
        projectTraceFacts(p.id, ownerId),
      ]);
      return {
        id: p.id,
        name: p.name,
        caseIdPrefix: p.caseIdPrefix,
        caseIdDigits: p.caseIdDigits,
        updatedAt: isoStamp(p.updatedAt),
        lastAccess: access[p.id] ?? null,
        planStatus: plan?.status ?? null,
        cases,
        coverage,
        closeDate: plan?.closeDate ?? null,
      };
    }),
  );
}

/** ISO with its zone, comparable with the last access. A value that is not
 *  a date is kept as it is, so one bad row never stops the list loading. */
function isoStamp(value: string): string {
  const date = parseStamp(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
