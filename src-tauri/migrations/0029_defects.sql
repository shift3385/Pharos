-- Defects as their own entity (DEF-01, ADR-0016; design 0.2.0 §5 step 8).
-- Additive. The planner's defect cards become rows here in the Rust step that
-- runs right after this SQL, in the same savepoint
-- (defects::migrate_planner_defects): same ids, same DEF keys, their
-- attachments re-pointed, the card soft-deleted.
--
-- Sync class lww for both tables (src-tauri/src/defects.rs). No foreign key
-- to defects from defect_links: a pull can bring a link before its defect,
-- and the bundled SQLite enforces foreign keys (the lesson of 0020/0024). The
-- repository checks the links. No UNIQUE index besides the primary key on
-- synced rows (design §3.4), except the live defect key, like the other keys
-- (0017, 0024): a pull never fails on it, because the local holder of a pulled
-- key is vacated first (key_sync, ADR-0010 «Enmienda A3»).
--
-- The enum CHECKs hold: a pulled value outside them is normalised by
-- defects::write_doc, never failing the pull.

CREATE TABLE IF NOT EXISTS defects (
    id                   TEXT PRIMARY KEY,
    workspace_id         TEXT NOT NULL,
    project_id           TEXT NOT NULL,
    defect_key           TEXT NOT NULL,              -- DEF-001 (DAT-01); '' for an old deleted card
    title                TEXT NOT NULL,
    description          TEXT NOT NULL DEFAULT '',
    steps_to_reproduce   TEXT NOT NULL DEFAULT '',
    expected             TEXT,
    actual               TEXT,
    severity             TEXT NOT NULL DEFAULT 'major'
                         CHECK (severity IN ('critical', 'major', 'minor', 'trivial')),
    priority             TEXT NOT NULL DEFAULT 'medium'
                         CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status               TEXT NOT NULL DEFAULT 'new'
                         CHECK (status IN ('new', 'open', 'in_progress', 'fixed', 'retest',
                                           'closed', 'rejected', 'deferred')),
    resolution           TEXT
                         CHECK (resolution IS NULL OR resolution IN ('fixed', 'duplicate',
                                'not_reproducible', 'wont_fix', 'by_design')),
    found_in_run_id      TEXT,
    found_in_build       TEXT,
    found_in_environment TEXT,
    fixed_in_build       TEXT,
    reporter             TEXT NOT NULL,
    assignee             TEXT,
    external_system      TEXT,                       -- INT-05 (Jira, 0.8.0)
    external_key         TEXT,
    external_url         TEXT,
    external_synced_at   TEXT,
    data                 TEXT NOT NULL DEFAULT '{}', -- labels, custom fields (ADR-0018)
    created_by           TEXT NOT NULL,
    updated_by           TEXT NOT NULL,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    deleted_at           TEXT,
    revision             INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS defects_project_idx ON defects (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS defects_project_key_uidx
    ON defects (project_id, defect_key)
    WHERE deleted_at IS NULL AND defect_key <> '';

-- What a defect points at. id = UUIDv5(NS_DEFECT_LINK, [defect_id,
-- target_kind, target_id]) (defects/ids.rs): linking the same thing on two
-- devices is the same row. Unlinking is a soft delete; linking again revives it.
CREATE TABLE IF NOT EXISTS defect_links (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id   TEXT NOT NULL,
    defect_id    TEXT NOT NULL,
    target_kind  TEXT NOT NULL
                 CHECK (target_kind IN ('result', 'test_case', 'requirement', 'finding',
                                        'session_note')),
    target_id    TEXT NOT NULL,
    created_by   TEXT NOT NULL,
    updated_by   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    revision     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS defect_links_defect_idx ON defect_links (defect_id);
CREATE INDEX IF NOT EXISTS defect_links_target_idx ON defect_links (target_kind, target_id);
