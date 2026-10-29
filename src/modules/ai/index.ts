// Public API of the ai module (spec §8).
export { AiPage } from "./ui/AiPage";
export { AssistButton } from "./ui/AssistButton";
export { AiSuggestList } from "./ui/AiSuggestList";
export { AiFailureNotice } from "./ui/AiFailureNotice";
export { ProvenanceBadge } from "./ui/ProvenanceBadge";
export {
  aiChat,
  aiStatus,
  aiAvailable,
  aiDestination,
  assistDraft,
  suggestTests,
  loadConfig,
  resolveProvider,
} from "./api/aiApi";
export type { AiResult, AssistRequest, TestSuggestion } from "./api/aiApi";
export { AiOutputError, describeAiFailure } from "./api/structured";
export type { AiFailure, AiOutputErrorKind } from "./api/structured";
export { generateCasesFromRequirement, suggestPreconditions, suggestRisks } from "./api/generators";
export type { RequirementBrief } from "./api/generators";
export type { GeneratedCase, RiskSuggestion } from "./model/schemas";
export { hasPendingReview, isPendingReview, markReviewed, withProvenance } from "./model/provenance";
export type { AiDestination, AiMessage, AiProvenance, ProvenanceMap } from "./model/types";
