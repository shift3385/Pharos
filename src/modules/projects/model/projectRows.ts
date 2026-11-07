// Rows of the Proyectos screen: every project of the user with what the table
// shows. The web gets them in one read of the server (ADR-0035); the desktop
// composes the other modules' public APIs over its local store.
import { planClosure, projectPlanClosure, projectPlanStatus } from "@modules/test-plan";
import { projectCaseCount } from "@modules/test-cases";
import { projectCoverage } from "@modules/traceability";
import { isTauri } from "@shared/platform";
import { parseStamp } from "@shared/time/stamp";
import { projectApi } from "../api/projectApi";
import { lastAccessMap } from "./lastAccess";
import type { ProjectRow } from "./projectTable";
import type { ProjectSummary } from "./types";

type RowFacts = Pick<ProjectRow, "planStatus" | "cases" | "coverage" | "closeDate">;

export async function projectRows(ownerId: string): Promise<ProjectRow[]> {
  const access = lastAccessMap(ownerId);
  const row = (p: ProjectSummary, facts: RowFacts): ProjectRow => ({
    id: p.id,
    name: p.name,
    caseIdPrefix: p.caseIdPrefix,
    caseIdDigits: p.caseIdDigits,
    updatedAt: isoStamp(p.updatedAt),
    lastAccess: access[p.id] ?? null,
    ...facts,
  });
  if (!isTauri()) {
    return (await projectApi.webOverview()).map((p) =>
      row(p, {
        planStatus: p.plan?.status ?? null,
        cases: p.cases,
        coverage: p.coverage,
        closeDate: p.plan ? planClosure(p.plan.data).closeDate : null,
      }),
    );
  }
  const projects = await projectApi.list(ownerId);
  return Promise.all(
    projects.map(async (p): Promise<ProjectRow> => {
      const [planStatus, closure, cases, coverage] = await Promise.all([
        projectPlanStatus(p.id, ownerId),
        projectPlanClosure(p.id, ownerId),
        projectCaseCount(p.id, ownerId),
        projectCoverage(p.id, ownerId),
      ]);
      return row(p, { planStatus, cases, coverage, closeDate: closure?.closeDate ?? null });
    }),
  );
}

/** ISO with its zone, comparable with the last access. A value that is not
 *  a date is kept as it is, so one bad row never stops the list loading. */
function isoStamp(value: string): string {
  const date = parseStamp(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
