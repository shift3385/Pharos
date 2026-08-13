import { testPlanApi } from "../api/testPlanApi";

/** Builds a compact context string from a project's test plan (title, summary,
 *  types, levels, scope) to feed the AI "suggest tests" flow. Null if no plan. */
export async function planContextForProject(projectId: string): Promise<string | null> {
  const plan = await testPlanApi.byProject(projectId);
  if (!plan) return null;
  const d = plan.data ?? {};
  const lines: string[] = [`Title: ${plan.title}`];
  if (d.summary?.trim()) lines.push(`Summary: ${d.summary.trim()}`);
  const types = (d.testTypes ?? []).filter(Boolean);
  if (types.length) lines.push(`Test types: ${types.join(", ")}`);
  const levels = (d.testLevels ?? []).filter(Boolean);
  if (levels.length) lines.push(`Test levels: ${levels.join(", ")}`);
  const scope = (d.scopeIn ?? []).filter(Boolean);
  if (scope.length) lines.push(`In scope: ${scope.join(", ")}`);
  return lines.join("\n");
}
