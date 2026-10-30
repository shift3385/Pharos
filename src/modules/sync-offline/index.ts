// Public API of the sync-offline module (spec §9). Phase 8A: local oplog +
// status indicator. 8B: backend push/pull. 8C: HLC + conflict panel.
export const SYNC_OFFLINE_MODULE = "sync-offline" as const;
export { SyncIndicator, SyncStatusProvider } from "./ui/SyncIndicator";
// Web only: what an older web version left unsent (shown by the app shell).
export { LegacyUnsentNotice } from "./ui/LegacyUnsentNotice";
export { syncStatus, syncPendingCount, type SyncStatus } from "./api/syncApi";
// The web's client of the server's domain API (BASE-10).
export { serverApi, desktopOnly } from "./web/serverApi";
