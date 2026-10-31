-- Evidence store (DAT-03, ADR-0014). Attachment contents move out of the
-- database into encrypted, content-addressed files under `evidence/`
-- (src-tauri/src/evidence.rs). Here only the metadata lives:
--
-- - `blobs`: local state of each content, by plaintext sha256. Never synced.
--   local_state: present | remote_only (0.4.0, SYNC-04b) | missing |
--   deleting (no live attachment needs it; the file goes after the next save).
-- - `attachments`: one use of a content (who attached what, to what, with what
--   name). Shaped as an LWW sync entity (audit fields, revision, soft delete),
--   but not registered for sync yet: registering it is one line (step 7 or
--   SYNC-04b). No UNIQUE index besides the key (design 0.2.0 §3.4).
--   owner_entity: planner_card now; result | step_result | session_note |
--   defect | run_shard later. kind: evidence | screenshot | video | trace |
--   log | raw_report. No CHECK on either, so later values need no rebuild.
--   blob_purged_at: the content expired by retention; the row stays.
-- - `evidence_retention`: per-project overrides of the retention per kind
--   (days NULL = always). Empty = the ADR defaults (evidence.rs). Local.
--
-- The planner_attachments BLOBs are moved by Rust code before 0023 drops the
-- table (evidence::migrate_planner_attachments).

CREATE TABLE IF NOT EXISTS blobs (
    sha256      TEXT PRIMARY KEY,
    size        INTEGER NOT NULL,
    mime        TEXT,
    local_state TEXT NOT NULL,
    stored_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL,
    project_id     TEXT NOT NULL,
    sha256         TEXT NOT NULL,
    size           INTEGER NOT NULL,
    mime           TEXT,
    name           TEXT NOT NULL,
    owner_entity   TEXT NOT NULL,
    owner_id       TEXT NOT NULL,
    kind           TEXT NOT NULL DEFAULT 'evidence',
    blob_purged_at TEXT,
    created_by     TEXT NOT NULL,
    updated_by     TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT,
    revision       INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS attachments_owner_idx ON attachments (owner_entity, owner_id);
CREATE INDEX IF NOT EXISTS attachments_sha_idx ON attachments (sha256);

CREATE TABLE IF NOT EXISTS evidence_retention (
    project_id TEXT NOT NULL,
    kind       TEXT NOT NULL,
    days       INTEGER,
    PRIMARY KEY (project_id, kind)
);
