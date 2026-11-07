// Public API of the ai module (spec §8).
export { AiEngineTab } from "./ui/AiEngineTab";
export { AssistButton } from "./ui/AssistButton";
export { AiSuggestList } from "./ui/AiSuggestList";
export { ListProposalView } from "./ui/ListProposalView";
export { AiFailureNotice } from "./ui/AiFailureNotice";
export { ProvenanceBadge } from "./ui/ProvenanceBadge";
export {
  aiChat,
  aiStatus,
  aiAvailable,
  assistDraft,
  suggestTests,
  loadConfig,
  resolveProvider,
} from "./api/aiApi";
export type { AiResult, AssistRequest, TestSuggestion } from "./api/aiApi";
export { AiOutputError, describeAiFailure } from "./api/structured";
export type { AiFailure, AiOutputErrorKind } from "./api/structured";
export {
  generateCasesFromRequirement,
  reviewCaseList,
  suggestClosureCriteria,
  suggestResponsibilities,
  suggestRisks,
} from "./api/generators";
export type { CaseListField, RequirementBrief } from "./api/generators";
export { applyProposals } from "./model/listReview";
export type { ListProposal, ListProposalOps } from "./model/listReview";
export type { GeneratedCase, RiskSuggestion } from "./model/schemas";
export { hasPendingReview, isPendingReview, markReviewed, withProvenance } from "./model/provenance";
export type { AiDestination, AiMessage, AiProvenance, ProvenanceMap } from "./model/types";
