-- Attachments and templates in sync (SYNC-04b, ADR-0042 §7, ADR-0014).
-- A template's file moves into the evidence store, like the planner
-- attachments in 0023: the template keeps the content's sha256, size and
-- media type. The Rust step of this migration (`blob_sync::migrate`) stores
-- each file, fills these columns and empties `templates.file` (the column
-- stays: dropping it re-checks the whole schema); it also
-- queues the attachments written before they synced. The `blobs` table gains
-- no column: a pulled content not yet downloaded is `remote_only`.

ALTER TABLE templates ADD COLUMN sha256 TEXT;
ALTER TABLE templates ADD COLUMN size INTEGER;
ALTER TABLE templates ADD COLUMN mime TEXT;

CREATE INDEX IF NOT EXISTS templates_sha_idx ON templates (sha256);
