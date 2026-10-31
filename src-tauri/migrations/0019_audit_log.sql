-- Audit log (AUD-01, ADR-0015). Append-only: one row per audited change,
-- written by `journal::record` in the same transaction as the change and its
-- oplog row. Events of other devices arrive by sync (`audit_event`, class
-- `append_only`) and are stored here as they came. Nothing is backfilled: the
-- history before 0.2.0 is the revisions.
--
-- Each row is a link of a hash chain per (device_id, chain_workspace_id,
-- chain_owner): `chain_seq` counts 1, 2, 3… and
--   hash = sha256(prev_hash ‖ JCS(event header) ‖ changes_sha256)
-- (audit.rs). The location (`workspace_id`, `project_id`) and `changes` stay
-- out of the header, so moving a project and redacting content never break
-- the chain. `user_id` is the account the event syncs with ('' = stays on this
-- device, e.g. a `system:` event without a project).
--
-- No UNIQUE besides the primary key (design 0.2.0 §3.4). The triggers make the
-- table append-only for every writer: no DELETE, and the only UPDATE allowed
-- is a redaction (changes → NULL, redacted_at set once, nothing else).

CREATE TABLE IF NOT EXISTS audit_log (
    id                 TEXT PRIMARY KEY,
    workspace_id       TEXT NOT NULL,
    project_id         TEXT,
    at                 TEXT NOT NULL,              -- UTC ISO-8601 with ms
    hlc                TEXT NOT NULL,
    device_id          TEXT NOT NULL,
    actor              TEXT NOT NULL,              -- user:<uuid> | system:<component> | agent:<id> | ci:<id>
    on_behalf_of       TEXT,
    action             TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore', 'import',
                                                       'execute', 'link', 'unlink', 'resolve_conflict', 'redact')),
    entity             TEXT NOT NULL,
    entity_id          TEXT NOT NULL,
    entity_key         TEXT,                       -- ATS_001, REQ-014… (for people)
    changes            TEXT,                       -- JSON { field: [before, after] }; NULL once redacted
    changes_sha256     TEXT NOT NULL,
    summary            TEXT,                       -- JSON (imports: counts)
    origin             TEXT NOT NULL DEFAULT 'local' CHECK (origin IN ('local', 'migration')),
    chain_workspace_id TEXT NOT NULL,
    chain_owner        TEXT NOT NULL DEFAULT '',
    chain_seq          INTEGER NOT NULL,
    prev_hash          TEXT,
    hash               TEXT NOT NULL,
    user_id            TEXT NOT NULL DEFAULT '',
    redacted_at        TEXT
);

CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_at_idx ON audit_log (workspace_id, at);
CREATE INDEX IF NOT EXISTS audit_chain_idx ON audit_log (device_id, chain_workspace_id, chain_owner, chain_seq);

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
    SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_log_only_redaction
BEFORE UPDATE ON audit_log
WHEN NOT (
        NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.project_id IS OLD.project_id
    AND NEW.at IS OLD.at AND NEW.hlc IS OLD.hlc AND NEW.device_id IS OLD.device_id
    AND NEW.actor IS OLD.actor AND NEW.on_behalf_of IS OLD.on_behalf_of AND NEW.action IS OLD.action
    AND NEW.entity IS OLD.entity AND NEW.entity_id IS OLD.entity_id AND NEW.entity_key IS OLD.entity_key
    AND NEW.changes_sha256 IS OLD.changes_sha256 AND NEW.summary IS OLD.summary AND NEW.origin IS OLD.origin
    AND NEW.chain_workspace_id IS OLD.chain_workspace_id AND NEW.chain_owner IS OLD.chain_owner
    AND NEW.chain_seq IS OLD.chain_seq AND NEW.prev_hash IS OLD.prev_hash AND NEW.hash IS OLD.hash
    AND NEW.user_id IS OLD.user_id
    AND OLD.changes IS NOT NULL AND NEW.changes IS NULL
    AND OLD.redacted_at IS NULL AND NEW.redacted_at IS NOT NULL
)
BEGIN
    SELECT RAISE(ABORT, 'audit_log is append-only: only a redaction may change a row');
END;
