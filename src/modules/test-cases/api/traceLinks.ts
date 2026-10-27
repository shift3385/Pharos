import type { TestCase, TraceableCase } from "../model/types";
import { testCaseApi } from "./testCaseApi";

/** Cases of a project with their requirement links (for the traceability
 *  matrix). Reads each case in full because the links live in `data`. */
export async function projectTraceableCases(projectId: string): Promise<TraceableCase[]> {
  const out: TraceableCase[] = [];
  for (const s of await testCaseApi.list(projectId)) {
    const c = await testCaseApi.get(s.id);
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

/** Replaces a case's requirement links, saving a new revision of the case (the
 *  rest of the case is untouched). Used by the free-text traceability migration. */
export async function setCaseRequirementKeys(
  caseId: string,
  requirementKeys: string[],
): Promise<TestCase | null> {
  const c = await testCaseApi.get(caseId);
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
  });
}
