import type { TestCase, TraceableCase } from "../model/types";
import { testCaseApi } from "./testCaseApi";

/** Cases of a project with their requirement links (for the traceability
 *  matrix). Reads each case in full because the links live in `data`. */
export async function projectTraceableCases(
  projectId: string,
  userId: string,
): Promise<TraceableCase[]> {
  const out: TraceableCase[] = [];
  for (const s of await testCaseApi.list(projectId, userId)) {
    const c = await testCaseApi.get(s.id, userId);
    if (!c) continue;
    out.push({
      id: c.id,
      scenarioId: c.scenarioId,
      title: c.title,
      status: c.status,
      requirementKeys: c.data?.requirementKeys ?? [],
      traceability: c.data?.traceability ?? "",
    });
  }
  return out;
}

/** The project's cases as a picker lists them (a cycle's «Añadir casos»,
 *  CYC-01): key, title, status and priority, from the summaries alone. */
export async function projectCaseOptions(
  projectId: string,
  userId: string,
): Promise<{ id: string; scenarioId: string; title: string; status: string; priority: string }[]> {
  return (await testCaseApi.list(projectId, userId)).map((s) => ({
    id: s.id,
    scenarioId: s.scenarioId,
    title: s.title,
    status: s.status,
    priority: s.priority,
  }));
}

/** Replaces a case's requirement links, saving a new revision of the case (the
 *  rest of the case is untouched). Used by the free-text traceability migration. */
export async function setCaseRequirementKeys(
  caseId: string,
  requirementKeys: string[],
  userId: string,
): Promise<TestCase | null> {
  const c = await testCaseApi.get(caseId, userId);
  if (!c) return null;
  return testCaseApi.update(c.id, {
    projectId: c.projectId ?? "",
    scenarioId: c.scenarioId,
    title: c.title,
    version: c.version,
    status: c.status,
    priority: c.priority,
    author: c.author,
    data: { ...c.data, requirementKeys: [...new Set(requirementKeys)] },
    userId,
  });
}
