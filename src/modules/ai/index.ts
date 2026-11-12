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
  suggestPlanLists,
  suggestResponsibilities,
  suggestRisks,
} from "./api/generators";
export type { CaseListField, PlanListGroup, RequirementBrief } from "./api/generators";
export {
  REQ_EXTRACT_PROMPT,
  REQ_SYNTHESIS_PROMPT,
  MAX_SYNTHESIS_CANDIDATES,
  extractRequirementCandidates,
  synthesizeRequirements,
} from "./api/requirementPrompts";
export type {
  ExistingRequirementBrief,
  ProjectFileText,
  SynthesisCandidate,
  SynthesisOptions,
} from "./api/requirementPrompts";
export type { RawRequirementCandidate, RawRequirementProposal } from "./model/schemas";
export { AiSendNotice } from "./ui/AiSendNotice";
export { aiDestinationNow } from "./api/aiApi";
export { applyProposals } from "./model/listReview";
export type { ListProposal, ListProposalOps } from "./model/listReview";
export type { GeneratedCase, PlanListSuggestion, RiskSuggestion } from "./model/schemas";
export { hasPendingReview, isPendingReview, markReviewed, withProvenance } from "./model/provenance";
export type { AiDestination, AiImage, AiImageType, AiMessage, AiProvenance, ProvenanceMap } from "./model/types";
export { aiVision } from "./api/aiApi";
export { visionFor } from "./model/capabilities";
export type { VisionCapability } from "./model/capabilities";
export {
  DESIGN_PROMPT_VERSION,
  buildDesignExtractionMessages,
  extractRequirementsFromDesign,
} from "./api/designPrompts";
export type { DesignPromptItem } from "./api/designPrompts";
export type { DesignExtraction } from "./model/schemas";
