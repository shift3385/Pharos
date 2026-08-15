-- Sync client state (Phase 8B, spec §9). The pull cursor must live WITH the data
-- (in the encrypted DB), not in localStorage: otherwise wiping the local DB while
-- the cursor persists elsewhere leaves the client unable to re-pull. Keeping it
-- here means a fresh/empty DB starts at cursor 0 and re-pulls everything.

CREATE TABLE IF NOT EXISTS sync_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
