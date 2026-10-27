// Public API of the ai module (spec §8).
export { AiPage } from "./ui/AiPage";
export { AssistButton } from "./ui/AssistButton";
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
export { hasPendingReview, isPendingReview, markReviewed, withProvenance } from "./model/provenance";
export type { AiMessage, AiProvenance, ProvenanceMap } from "./model/types";
