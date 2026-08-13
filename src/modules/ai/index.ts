// Public API of the ai module (spec §8).
export { AiPage } from "./ui/AiPage";
export { AssistButton } from "./ui/AssistButton";
export {
  aiChat,
  aiStatus,
  aiAvailable,
  assistDraft,
  suggestTests,
  loadConfig,
  resolveProvider,
} from "./api/aiApi";
export type { AssistRequest, TestSuggestion } from "./api/aiApi";
export type { AiMessage } from "./model/types";
