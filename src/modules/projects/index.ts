// Public API of the projects module (spec §5). Other modules import only this.
export { ProjectsPage } from "./ui/ProjectsPage";
export { projectOverview, progressPercent, matchesQuery } from "./model/overview";
export type { ProjectOverview } from "./model/overview";
