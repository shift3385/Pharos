import type { AiConfig } from "../model/types";

/** What the save bar names as pending (`ai.pending.<id>`). */
export type PendingChange = "mode" | "provider" | "key" | "model" | "baseUrl" | "temperature" | "ollama";

/** What differs from the saved configuration, in the order of the screen (pure —
 *  testable). `keyTyped`: a key waits in the field to be stored. */
export function pendingChanges(draft: AiConfig, saved: AiConfig, keyTyped: boolean): PendingChange[] {
  const changes: PendingChange[] = [];
  if (draft.mode !== saved.mode) changes.push("mode");
  if (draft.onlineProvider !== saved.onlineProvider) changes.push("provider");
  if (draft.customBaseUrl !== saved.customBaseUrl) changes.push("baseUrl");
  if (keyTyped) changes.push("key");
  if (JSON.stringify(draft.onlineModels) !== JSON.stringify(saved.onlineModels)) changes.push("model");
  if (draft.temperature !== saved.temperature || draft.customSendTemperature !== saved.customSendTemperature) {
    changes.push("temperature");
  }
  if (draft.ollamaEndpoint !== saved.ollamaEndpoint || draft.offlineModel !== saved.offlineModel) {
    changes.push("ollama");
  }
  return changes;
}
