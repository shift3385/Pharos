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
  the server must accept at least 1 MiB per push. Network errors, 5xx and 429
  are retried with growing waits; 401/403/426 stop the sync. A batch refused
  for its content (413, 400) is split to isolate the deltas at fault
  (`sendIsolating`): they are skipped and stay pending, the user is told
  (`pharos:sync-skipped`), and the other batches and the pull still run.
  Pulls page until `hasMore` is false and the cursor is saved after every
  page (FIX-02). The server serializes each user's writes (advisory lock), so
  a cursor never skips a late commit.
- **Project deletes (FIX-05).** The server tombstones a deleted project's plans,
  cases, requirements and cards, so every client receives them as normal
  deletes. A device with a pending edit of one of them gets a conflict. If the
  project delete itself comes back as a conflict and the user takes the server
  version, the children deleted with it are restored.
- **Orphans.** A change written before its entity's owner is known (a case
  whose project was not pulled yet) is stamped `''`; it is claimed as soon as
  the owner can be derived, and meanwhile the indicator tooltip counts it.
- **Purge (SYNC-06).** `api/purgeApi.ts` → `purge_deleted` (`src-tauri/src/purge.rs`)
  removes for good, on this device, the signed-in account's rows deleted more
  than `retentionDays` ago (Administration), with their history, attachments,
  oplog rows, sync bases and resolved conflicts. `SyncIndicator` runs it after
  sign-in (also offline) and after every sync. A row waits while it has an open
  conflict, or a pending change the server must receive first (unless the
  server never knew it); a child waits while its project's delete is pending or
  in conflict. Keys of purged cases, requirements and defects go to
  `retired_keys` and stay taken. The server keeps every tombstone, so a later
  pull of it updates nothing: a purged record never comes back. After
  `SYNC_TOMBSTONE_DAYS` (30) the server clears the tombstone's payload, without
  a new `seq`. A record comes back only if another device still had it and the
  user chose "keep mine" in the conflict panel.
- **Duplicate keys until DAT-01.** Two devices can number `REQ-004` offline.
  Both requirements are kept (migration `0013` makes the local index
  non-unique); creating one locally still rejects a duplicate key.

## Web client (`web/webSync.ts`, ADR-0004)

- **Outbox.** Web writes (`pushEntity`) go to `pharos.sync.outbox:<userId>`,
  one entry per entity, and are pushed in batches. A transient failure stays
  queued and is retried every 10 s, on reconnect and on "Sync now" (FIX-04);
  auth or version errors stop without retrying; a delta refused for its
  content is flagged `refused` and not resent until the entity is edited.
  Writes queued during a flush go out in the same flush.
- **Lost conflicts.** When the server keeps a newer version, the web edit and
  the server version are stored in `pharos.sync.conflicts:<userId>`, a toast
  tells the user, and the same conflict panel resolves it: `local` pushes the
  web version again with a newer HLC, `remote` takes the server copy. While
  queued or in conflict, a pull never replaces the web edit in the cache, but
  it does refresh the conflict's server side, so neither choice acts on a
  stale copy.
- **Caches per account.** `pharos.sync.cacheOwner` records whose server data
  the caches hold; they are emptied on sign-out (`pharos:signed-out`) and when
  another account syncs. On the first full pull after upgrading, rows of this
  account that the server does not have (old pushes that failed silently) are
  queued instead of lost.
- **Pull.** Incremental from `pharos.sync.cursor:<userId>`; if every cache is
  empty it restarts at 0. Deleted requirements keep a `deletedAt` tombstone so
  their key is never reused.
