-- Immutable, synced case revisions (DAT-02, ADR-0011). From 0.2.0 every
-- state a case reaches gets one row (`revisions.rs`), the current one
-- included, whose id is UUIDv5(case ‖ revision ‖ content_sha256) and whose
-- columns hold the whole content the hash covers:
--   content_sha256 = sha256(JCS({scenarioId, title, version, status, priority,
--                                caseType, automationStatus, data}))
-- `workspace_id`/`project_id` are its location, outside the hash. `hlc` is the
-- clock of the device that wrote it. Rows sync as `test_case_revision`
-- (class append_only). The rows written so far (the previous states
-- `update_case` copied, random ids) are copied unchanged, with
-- `content_sha256` NULL, and never sync.
--
-- The table is rebuilt without the foreign key to `test_cases`: a pull may
-- bring a case's older revisions before the case itself (the case's document
-- has a newer `seq`), and the bundled SQLite enforces foreign keys. The purge
-- (SYNC-06) deletes a purged case's revisions itself.
--
-- No UNIQUE besides the primary key (design 0.2.0 §3.4): two divergent
-- "revision 4" of two devices are two rows.

CREATE TABLE test_case_revisions_0020 (
    id                TEXT PRIMARY KEY,
    test_case_id      TEXT NOT NULL,
    revision          INTEGER NOT NULL,
    title             TEXT NOT NULL,
    data              TEXT NOT NULL,
    created_at        TEXT NOT NULL,
    created_by        TEXT NOT NULL,
    workspace_id      TEXT,
    project_id        TEXT,
    scenario_id       TEXT,
    version           TEXT,
    status            TEXT,
    priority          TEXT,
    case_type         TEXT,
    automation_status TEXT,
    content_sha256    TEXT,
    hlc               TEXT NOT NULL DEFAULT ''
);

INSERT INTO test_case_revisions_0020 (id, test_case_id, revision, title, data, created_at, created_by)
    SELECT id, test_case_id, revision, title, data, created_at, created_by FROM test_case_revisions;

DROP TABLE test_case_revisions;
ALTER TABLE test_case_revisions_0020 RENAME TO test_case_revisions;

CREATE INDEX test_case_revisions_case_idx ON test_case_revisions (test_case_id);
CREATE INDEX test_case_revisions_case_rev_idx ON test_case_revisions (test_case_id, revision);

-- The content of a hashed revision never changes; its location may (ADR-0019).
-- Deleting stays possible: the purge (SYNC-06) removes a purged case's rows.
CREATE TRIGGER test_case_revisions_immutable
BEFORE UPDATE OF test_case_id, revision, title, data, scenario_id, version, status, priority,
                 case_type, automation_status, content_sha256 ON test_case_revisions
WHEN OLD.content_sha256 IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'test_case_revisions: the content of a revision never changes');
END;
