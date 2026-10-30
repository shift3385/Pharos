/** Query parameter of the Casos section that opens one case in the editor. */
export const CASE_PARAM = "case";

/** Route of the Casos section of a project with one case open (`?case=<id>`).
 *  It repeats the shape of `projectPath(id, "cases")` (projects module,
 *  ADR-0029) because projects depends on test-cases, not the other way. */
export function caseLink(projectId: string, caseId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/cases?${CASE_PARAM}=${encodeURIComponent(caseId)}`;
}
