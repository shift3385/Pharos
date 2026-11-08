/** A project's sections. Each one is a URL, `/projects/:projectId/:section`
 *  (ADR-0029), so the sidebar, the breadcrumbs, "back" and a reload all know
 *  which project and section are open. In the menu's order (UX-21): the
 *  main flow of the test process, from the plan and the requirements (the
 *  test basis) to the cases, their execution, the defects and, last, the
 *  traceability matrix that measures the coverage. */
export const PROJECT_SECTIONS = [
  "plan",
  "planner",
  "requirements",
  "cases",
  "cycles",
  "runs",
  "defects",
  "traceability",
  "settings",
] as const;
export type ProjectSection = (typeof PROJECT_SECTIONS)[number];
/** What opening a project shows (UX-22): the board, the day-to-day work. */
export const DEFAULT_PROJECT_SECTION: ProjectSection = "planner";

export function isProjectSection(value: string | undefined): value is ProjectSection {
  return PROJECT_SECTIONS.includes(value as ProjectSection);
}

/** Route of a project section (the board when none is given). */
export function projectPath(projectId: string, section: ProjectSection = DEFAULT_PROJECT_SECTION) {
  return `/projects/${encodeURIComponent(projectId)}/${section}`;
}
