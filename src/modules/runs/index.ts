// Public API of the runs module («Ejecuciones», EJE-01, ING-02..05): the
// project's runs, the import of test reports and the unlinked tray; and the
// execution derivation (step 10, contract v1) the matrix, the status report
// and the Home metrics read.
export { RunsPage } from "./ui/RunsPage";
// Registers the web drafts' sign-out cleanup with the module (EJE-06).
import "./model/webDrafts";
export type { LinkableCase as RunLinkableCase } from "./model/types";
export {
  executionApi,
  localDayStart,
  periodOf,
  summaryQuery,
} from "./api/executionApi";
export { evaluateExitCriteria } from "./model/exitCriteria";
export { StatusReportDialog } from "./report/StatusReportDialog";
export { StatusReportButton } from "./report/StatusReportButton";
// The quality gate at closing a cycle (DOC-02).
export { CloseCycleButton } from "./gate/CloseCycleButton";
export { criterionState, gateState, verdictTone } from "./model/gate";
export type {
  CaseExecution,
  ExecutionFilter,
  ExecutionSummary,
  ExitCriterion,
  HomeMetrics,
  HomeRequest,
  LastResult,
  RequirementExecution,
} from "@shared/contracts/contract";
