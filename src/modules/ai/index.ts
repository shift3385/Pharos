// Public API of the ai module (spec §8).
export { AiPage } from "./ui/AiPage";
export { aiChat, aiStatus, loadConfig, resolveProvider } from "./api/aiApi";
export type { AiMessage } from "./model/types";
