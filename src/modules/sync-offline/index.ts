// Public API of the sync-offline module (spec §9). Phase 8A: local oplog +
// status indicator. 8B: backend push/pull. 8C: HLC + conflict panel.
export const SYNC_OFFLINE_MODULE = "sync-offline" as const;
export { SyncIndicator } from "./ui/SyncIndicator";
export { syncStatus, syncPendingCount, type SyncStatus } from "./api/syncApi";
export { pushEntity, hydrateFromBackend } from "./web/webSync";
