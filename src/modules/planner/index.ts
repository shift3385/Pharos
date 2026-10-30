// Public API of the planner module (spec §7). The board is scoped to a project.
export { PlannerBoard } from "./ui/PlannerBoard";
export { projectCardCount, projectDefects } from "./api/plannerApi";
export type { LinkableCase, PlannerCard } from "./model/types";
