// Public API of the traceability module (v0.0.2, TRZ-01..03). It depends on
// test-cases and planner through their public APIs; neither depends on it (the
// projects module composes them), so the module graph stays acyclic.
export { TraceabilityPage } from "./ui/TraceabilityPage";
export { requirementApi } from "./api/requirementApi";
export type { Requirement, RequirementPriority } from "./model/types";
