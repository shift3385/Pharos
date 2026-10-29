# sync-offline

Offline-first synchronization domain (spec §9).

- **8A — oplog + indicator.** Every local mutation appends a delta to the Rust
  oplog; the Topbar shows `Synced / Pending changes (n) / Offline`. The count is
  the number of distinct synced entities with unsynced rows of the signed-in
  account — exactly what the next push sends (FIX-01).
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

Granularity is **per entity** (decision 2026-08-13, ADR-0002). Field-level LWW
(SYNC-02) is pending; the conflict rows store both full versions so a `merged`
resolution can be added without a schema change.

## Gate A corrections (ADR-0020)

- **What syncs (SYNC-04a).** `project`, `test_plan`, `test_case`,
  `requirement`, `planner_card` — one list, `SYNCED` in `oplog.rs` and
  `SYNCED_ENTITIES` on the server. Templates and attachments still journal to
  the oplog and wait for SYNC-04b.
- **Per account (FIX-07).** `oplog`, `sync_base` and `sync_conflicts` carry
  `user_id` (the entity's owner, derived by `oplog::record`); the cursor is
  `cursor:<user_id>`. Every sync command takes `userId`, read together with the
  token from one session (`getSession()`), so an account never pushes another
  account's changes nor overwrites its entities on a pull.
- **Transport (`api/transport.ts`).** Every request carries `x-pharos-version`
  (`__APP_VERSION__`, from the root `package.json`); the server answers an
  unsupported version with 426 `unsupported_client_version` before writing
  (SYNC-08). Pushes go in batches of at most 200 deltas / ~512 KiB (FIX-03);
  network errors, 5xx and 429 are retried with growing waits. Pulls page until
  `hasMore` is false and the cursor is saved after every page (FIX-02).
- **Project deletes (FIX-05).** The server tombstones a deleted project's plans,
  cases, requirements and cards, so every client receives them as normal
  deletes. A device with a pending edit of one of them gets a conflict.
- **Duplicate keys until DAT-01.** Two devices can number `REQ-004` offline.
  Both requirements are kept (migration `0013` makes the local index
  non-unique); creating one locally still rejects a duplicate key.

## Web client (`web/webSync.ts`, ADR-0004)

- **Outbox.** Web writes (`pushEntity`) go to `pharos.sync.outbox:<userId>`,
  one entry per entity, and are pushed in batches. A failed push stays queued
  and is retried every 10 s, on reconnect and on "Sync now" (FIX-04).
- **Lost conflicts.** When the server keeps a newer version, the web edit and
  the server version are stored in `pharos.sync.conflicts:<userId>`, a toast
  tells the user, and the same conflict panel resolves it: `local` pushes the
  web version again with a newer HLC, `remote` takes the server copy. While
  queued or in conflict, a pull never replaces the web edit in the cache.
- **Pull.** Incremental from `pharos.sync.cursor:<userId>`; if every cache is
  empty it restarts at 0. Deleted requirements keep a `deletedAt` tombstone so
  their key is never reused.
