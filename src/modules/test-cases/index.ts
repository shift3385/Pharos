// Public API of the test-cases module (spec §5.3).
export { TestCasesPage } from "./ui/TestCasesPage";
export { caseLink } from "./model/caseLink";
export { CASES_CHANGED_EVENT, CASE_REVIEW_EVENT, onCaseReview } from "./model/events";
export type { CaseReviewEvent } from "./model/events";
// The review flow (CAS-02, ADR-0047): the workspaces track installs its role
// check here; the notifications track listens to `onCaseReview`.
export { approverCheck, otherThanAuthor, setApproverCheck } from "./review/approver";
export type { ApprovalRequest, ApprovalVerdict, ApproverCheck } from "./review/approver";
export {
  FILES_PER_CASE,
  projectCaseFiles,
  projectCaseCount,
  projectCaseProgress,
  projectLiveCases,
} from "./export/batch";
export { exportCasePdf } from "./export/casePdf";
export { projectCaseOptions, projectTraceableCases, setCaseRequirementKeys } from "./api/traceLinks";
export { createProposedCases, proposalGherkin } from "./api/proposedCases";
export { GherkinCode } from "./ui/GherkinEditor";
export type { CreateProposedCasesResult, ScenarioProposal } from "./api/proposedCases";
export type { RequirementOption, TraceableCase } from "./model/types";
export type { CaseLastResult } from "./model/caseList";
