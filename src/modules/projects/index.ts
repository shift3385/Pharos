// Public API of the projects module (spec §5). Other modules import only this.
export { ProjectsPage } from "./ui/ProjectsPage";
export { projectOverview, progressPercent, matchesQuery } from "./model/overview";
export type { ProjectOverview } from "./model/overview";
export { ProjectDetailPage } from "./ui/ProjectDetail";
export { ProjectHeader } from "./ui/ProjectHeader";
export { useProjectHeaderActions } from "./ui/projectHeaderActions";
export type { ProjectHeaderInfo } from "./ui/ProjectHeader";
export {
  PROJECT_SECTIONS,
  DEFAULT_PROJECT_SECTION,
  isProjectSection,
  projectPath,
} from "./model/sections";
export type { ProjectSection } from "./model/sections";
export { projectApi } from "./api/projectApi";
export type { ProjectSummary } from "./model/types";
