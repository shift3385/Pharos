# sync-offline

Offline-first synchronization domain (spec §9).

- **8A — oplog + indicator.** Every local mutation appends a delta to the Rust
  oplog; the Topbar shows `Synced / Pending changes (n) / Offline`. The count is
  the number of distinct synced entities with unsynced rows of the signed-in
  account — exactly what the next push sends (FIX-01).
- **8B — push/pull.** `api/syncApi.ts` pushes pending deltas to the backend
  (`POST /sync/push`) and pulls remote documents (`GET /sync/pull?since=`).
  The web build does not sync: it is a client of the server (below).
- **8C — HLC + conflicts.** `domain/hlc.ts` (mirrored in `src-tauri/src/hlc.rs`)
  stamps every change with a Hybrid Logical Clock. Desktop deltas carry their
  base version (`sync_base`); the server rejects a delta whose base it no longer
  holds and returns its own version. That pair is kept in `sync_conflicts` and
  shown in `ui/ConflictPanel.tsx`, where the user keeps one version per entity
  (`domain/conflict.ts` builds the field-by-field view). Web writes are
  stamped by the server's clock (`server/src/modules/sync/sync.hlc.ts`).

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
- **Keys across devices (DAT-01, ADR-0010).** Case, requirement and defect
  keys are unique per project between devices:
  - every desktop sync starts with `leaseKeyBlocks`: `key_lease_requests` lists
    the project/kind pairs with fewer than 10 numbers left,
    `POST /sync/key-blocks` leases blocks of 50, and `key_blocks_apply` stores
    them and gives provisional keys (`ATS_?KQZD`, created offline without a
    block) their definitive one before the push. A server without the
    endpoint (404) only leaves keys provisional;
  - the server refuses an upsert whose key another live document of the
    project has (`keyConflicts` in the push answer). `key_conflicts_record`
    gives the row a provisional key and a key conflict. Only clients that send
    `x-pharos-sync-features: key-conflicts` (`transport.ts`) get that answer;
    an older client gets 426 instead of a refusal it would take for accepted;
  - on a pull, a different local row holding the pulled key loses it the same
    way (`sync.rs::write_doc`);
  - a row with an open key conflict is not pushed. The conflict panel lists it
    (`ui/KeyConflictList.tsx`): type a new key or take the next number
    (`key_conflict_resolve`). The indicator counts it with the conflicts. It
    also closes when the server sends the row with a key, when the server
    deletes the holder of a key a synced row lost (`holder_deleted`), or when
    the row is deleted (its delete must still sync);
  - on the web a taken key is refused when saving (409 `key_taken`), with a toast.

## Sync classes and compatibility (AUD-01, design 0.2.0 §3)

- **Two classes.** `lww` is everything above (`oplog::SYNCED`,
  `LWW_ENTITIES`). `append_only` documents are inserted if absent, carry no
  base and never conflict; the server refuses other content under an existing
  id (`appendRejected`) and keeps its own. The first one is `audit_event` (the
  audit log, `src-tauri/src/audit.rs`). Adding one is one entry in
  `src-tauri/src/sync_class.rs` (`APPEND_ONLY`, with its read, insert and owner
  functions) and one in `server/src/modules/sync/sync.schemas.ts`
  (`APPEND_ONLY_ENTITIES`), plus a bump of `APPLIED_SET_VERSION`.
- **The cycle.** Key blocks → lww push → pull → append-only push
  (`pushAppendOnly`, `oplog_pending` with `class: "append_only"`). The client
  sends `x-pharos-sync-features: key-conflicts,append-only`; a server that knows
  the class answers with `features`. Append-only documents are only pushed to a
  server that listed `append-only`; against an older server they stay pending
  (the exported diagnostics count them, `pendingAuditEvents`). They are not in
  the "pending changes" badge. A refused one stays pending and is logged, not
  shown. A failed push of them is logged and never fails the sync; a refused
  one is marked (`oplog_mark_rejected`), never resent, and counted in the
  diagnostics (`rejectedAuditEvents`).
- **Older clients.** A client without `append-only` (0.1.x, 0.2.0-alpha.1) gets
  exactly the previous answers and no append-only document in its pulls; its
  pushes of the lww entities are unchanged.
- **A missing field keeps the stored value, for old clients only.** The
  client sends `x-pharos-sync-features: complete-payload`: it pushes each
  entity's whole state, so a key it leaves out is a clear. An upsert from a
  client without it (0.1.x, 0.2.0-alpha.1) keeps on the server every key it
  left out, and `data` keys one level deep (`storeDoc`), so it never resets a
  field it does not know. Web domain writes are never merged. On pull the
  desktop takes the document as it is: the server already protected it.
  Sending `null` to clear is the recommended practice, not a requirement.
- **Cursor reset.** `sync_cursor_get` returns `0` when the cursor was stored
  under an older set of applied entities (`cursor_set:<user_id>` ≠
  `APPLIED_SET_VERSION`): an older build moved its cursor past documents it
  skipped. Re-pulling is safe (what matches `sync_base` is a no-op), and
  `sync_cursor_set` stores the set with every page, so it restarts once.

## Web client (`web/serverApi.ts`, ADR-0004, BASE-10)

The web build has no local store, oplog or outbox. Every module API calls the
server's domain API (`/api/*`, `server/src/modules/domain/`) through
`serverApi`, and the server applies the domain rules on the same document
store the devices sync with. So the web has nothing pending, no conflicts and
no pull: "Sync now" only reloads the open pages.

- **Edits never overwrite blindly (FIX-04).** `serverApi` remembers the
  revision of each item it read and sends it with every update and delete.
  If the item changed elsewhere, the server answers 409 `stale_write` with its
  version: a toast tells the user, the form keeps the edit, and saving again
  replaces that version (its revision is now the one remembered).
- **Refusals the user can act on** (`key_taken`, `key_retired`, `invalid_key`,
  desktop-only features) are shown once as a toast and thrown as
  `ReportedError`.
- **Deleted elsewhere.** 409 `deleted_elsewhere` has its own toast and
  changes nothing remembered: saving again repeats it.
- **Old browser data** (`web/legacyWebData.ts`). On the account's first sync
  with this version, the old outbox (`pharos.sync.outbox:<userId>`) is pushed
  one last time. Changes the server does not take, open web conflicts, and the
  attachments, imported templates and revision history that only lived in the
  browser are set aside in `pharos.legacy.unsent:<userId>` (written before
  anything is removed); then the old caches, outbox, conflicts, cursor and
  clock are removed. `ui/LegacyUnsentNotice.tsx` (topbar, web only) offers
  "Download" (`pharos-web-unsent-<date>.json`) and removes the set only when
  the user confirms the file is saved or discards it: a browser download
  cannot tell it was saved. The browser-only data was kept per browser: an
  account takes the attachments of the cards in its own outbox, and the rest
  only if `pharos.sync.cacheOwner` is that account (or unset, data from
  before FIX-07); the shared keys go when nothing is left. A network failure
  changes nothing. Other accounts' outboxes wait until those accounts sign in.

## Failures in the local log (`api/syncFailure.ts`, BASE-08, ADR-0022)

The UI tells the user; every sync failure also goes to the local log through
`logClientError`, so "Exportar diagnóstico" can explain it. Context line
`sync: <action>`: `manual` ("Sync now"), `auto` (startup, reconnect, after a
resolution), `state` (the 5 s count refresh), `conflicts-list`,
`key-conflicts-list`, `conflict-resolve`, `purge` (SYNC-06, after an automatic
sync) and `push-refused`.

- **No server text.** A `SyncHttpError` is logged as `HTTP <status> <code>`
  only: its message is what the server wrote (a parse error can quote the
  request body), and its stack starts with that message.
- **Native rejections** (strings from the Rust commands) keep only their type,
  like any non-`Error` value; other errors keep their redacted name, message
  and stack.
- **Refused changes** are one line per push, with entity types and ids, never
  payloads.
- **Background steps** (`auto`, `state`, `purge`) log a repeated failure
  once (`SyncFailureLog`) until it changes or the step succeeds, so an API
  that is down does not use up the log budget (20 messages every 10 s).
