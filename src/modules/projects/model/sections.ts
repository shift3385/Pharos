/** A project's sections. Each one is a URL, `/projects/:projectId/:section`
 *  (ADR-0029), so the sidebar, the breadcrumbs, "back" and a reload all know
 *  which project and section are open. */
export const PROJECT_SECTIONS = ["plan", "cases", "cycles", "planner", "traceability", "settings"] as const;
export type ProjectSection = (typeof PROJECT_SECTIONS)[number];
export const DEFAULT_PROJECT_SECTION: ProjectSection = "plan";

export function isProjectSection(value: string | undefined): value is ProjectSection {
  return PROJECT_SECTIONS.includes(value as ProjectSection);
}

/** Route of a project section (the plan when none is given). */
export function projectPath(projectId: string, section: ProjectSection = DEFAULT_PROJECT_SECTION) {
  return `/projects/${encodeURIComponent(projectId)}/${section}`;
}
