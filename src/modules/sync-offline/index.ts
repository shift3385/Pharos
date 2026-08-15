// Public API of the sync-offline module (spec §9). Phase 8A: local oplog +
// status indicator. Phase 8B/8C add the backend push/pull and conflict panel.
export const SYNC_OFFLINE_MODULE = "sync-offline" as const;
export { SyncIndicator } from "./ui/SyncIndicator";
export { syncStatus, syncPendingCount, type SyncStatus } from "./api/syncApi";
