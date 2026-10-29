// Public API of the test-cases module (spec §5.3).
export { TestCasesPage } from "./ui/TestCasesPage";
export {
  FILES_PER_CASE,
  projectCaseFiles,
  projectCaseCount,
  projectCaseProgress,
} from "./export/batch";
export { exportCasePdf } from "./export/casePdf";
export { projectTraceableCases, setCaseRequirementKeys } from "./api/traceLinks";
export { createProposedCases, proposalGherkin } from "./api/proposedCases";
export type { CreateProposedCasesResult, ScenarioProposal } from "./api/proposedCases";
export type { RequirementOption, TraceableCase } from "./model/types";
