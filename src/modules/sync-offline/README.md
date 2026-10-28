# sync-offline

Offline-first synchronization domain (spec §9).

- **8A — oplog + indicator.** Every local mutation appends a delta to the Rust
  oplog; the Topbar shows `Synced / Pending changes (n) / Offline`.
- **8B — push/pull.** `api/syncApi.ts` pushes pending deltas to the backend
  (`POST /sync/push`) and pulls remote documents (`GET /sync/pull?since=`).
  `web/webSync.ts` lets the browser read/write the backend directly.
- **8C — HLC + conflicts.** `domain/hlc.ts` (mirrored in `src-tauri/src/hlc.rs`)
  stamps every change with a Hybrid Logical Clock. Desktop deltas carry their
  base version (`sync_base`); the server rejects a delta whose base it no longer
  holds and returns its own version. That pair is kept in `sync_conflicts` and
  shown in `ui/ConflictPanel.tsx`, where the user keeps one version per entity
  (`domain/conflict.ts` builds the field-by-field view). Web deltas carry an HLC
  but no base, so they resolve by last-write-wins on the HLC.

Granularity is **per entity** (decision 2026-08-13). Field-level LWW (SYNC-02)
is pending; the conflict rows store both full versions so a `merged`
resolution can be added without a schema change.
