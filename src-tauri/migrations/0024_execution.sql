-- Execution tables (EJE-01, RUN-00, KND-01; ADR-0012, ADR-0013; design 0.2.0
-- §5 step 4). One migration, additive except for the rebuild of the two key
-- tables. Forward-only.
--
-- Sync classes (design §3.2, src-tauri/src/runs.rs):
-- - lww: runs, run_items, unlinked_mappings (audit fields, revision, soft delete);
-- - append_only: run_shards and results; a result travels as one document with
--   its step_results inside;
-- - local: execution_drafts.
--
-- No foreign key to runs or results from a synced table (unlike the ADR
-- sketch): a pull can bring a result before its run, whose header edit has a
-- newer seq, and the bundled SQLite enforces foreign keys, so the whole pull
-- would fail (the lesson of 0020). The repositories check the links. Only
-- step_results → results keeps its key: both are written together and travel
-- in one document. No UNIQUE index besides the primary key on synced rows
-- (design §3.4), except the live run key, like the other keys (0010, 0017).

CREATE TABLE IF NOT EXISTS runs (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT NOT NULL,
    project_id          TEXT NOT NULL,
    run_key             TEXT NOT NULL,              -- RUN-001 (DAT-01)
    title               TEXT NOT NULL,
    trigger             TEXT NOT NULL,              -- manual | local | agent | ci | cloud | import
    source_tool         TEXT,
    source_tool_version TEXT,
    test_plan_id        TEXT,
    cycle_id            TEXT,                       -- ADR-0017 (step 6)
    configuration_id    TEXT,
    environment         TEXT,
    build               TEXT,
    commit_sha          TEXT,
    branch              TEXT,
    repository_url      TEXT,
    ci_url              TEXT,
    dataset             TEXT,                       -- name@version or hash
    context             TEXT NOT NULL DEFAULT '{}',
    status              TEXT NOT NULL DEFAULT 'in_progress'
                        CHECK (status IN ('in_progress', 'completed', 'aborted')),
    started_at          TEXT,
    finished_at         TEXT,
    summary             TEXT NOT NULL DEFAULT '{}', -- cached counts, recomputable
    data                TEXT NOT NULL DEFAULT '{}', -- custom fields (ADR-0018)
    created_by          TEXT NOT NULL,
    updated_by          TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    deleted_at          TEXT,
    revision            INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS runs_project_idx ON runs (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS runs_project_key_idx
    ON runs (project_id, run_key) WHERE deleted_at IS NULL;

-- What a run is meant to execute: case + frozen revision + flow + row.
CREATE TABLE IF NOT EXISTS run_items (
    id                    TEXT PRIMARY KEY,
    workspace_id          TEXT NOT NULL,
    project_id            TEXT NOT NULL,
    run_id                TEXT NOT NULL,
    test_case_id          TEXT NOT NULL,
    test_case_revision_id TEXT NOT NULL,
    flow_id               TEXT,
    example_row_id        TEXT,
    example_row           INTEGER,
    configuration_id      TEXT,
    assignee              TEXT,
    position              INTEGER NOT NULL DEFAULT 0,
    created_by            TEXT NOT NULL,
    updated_by            TEXT NOT NULL,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    deleted_at            TEXT,
    revision              INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS run_items_run_idx ON run_items (run_id);

-- One upload or import inside a run. id = UUIDv5(NS_RUN_SHARD, [run_id, sha256]).
CREATE TABLE IF NOT EXISTS run_shards (
    id                   TEXT PRIMARY KEY,
    workspace_id         TEXT NOT NULL,
    project_id           TEXT NOT NULL,
    run_id               TEXT NOT NULL,
    shard_index          INTEGER,
    shard_total          INTEGER,
    source_format        TEXT NOT NULL,             -- cucumber_messages | ctrf | junit | playwright_json | pharos_run_json | …
    source_file_sha256   TEXT NOT NULL,
    source_attachment_id TEXT,                      -- the raw report (ADR-0014)
    format_version       TEXT,
    imported_by          TEXT NOT NULL,
    imported_at          TEXT NOT NULL,
    hlc                  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS run_shards_file_idx ON run_shards (run_id, source_file_sha256); -- not unique

-- One attempt of one test. Imported: id = UUIDv5(NS_RESULT, [shard, test_key,
-- configuration_label, attempt]); manual: random.
CREATE TABLE IF NOT EXISTS results (
    id                    TEXT PRIMARY KEY,
    workspace_id          TEXT NOT NULL,
    project_id            TEXT NOT NULL,
    run_id                TEXT NOT NULL,
    shard_id              TEXT,
    run_item_id           TEXT,
    test_key              TEXT NOT NULL,
    test_case_id          TEXT,
    test_case_revision_id TEXT,
    case_revision         INTEGER,
    case_key              TEXT,
    flow_id               TEXT,
    example_row_id        TEXT,
    example_row           INTEGER,
    example_values        TEXT,
    configuration_id      TEXT,
    configuration_label   TEXT,
    attempt               INTEGER NOT NULL DEFAULT 0,
    status                TEXT NOT NULL
                          CHECK (status IN ('passed', 'failed', 'blocked', 'skipped', 'other')),
    raw_status            TEXT,
    duration_ms           INTEGER,
    started_at            TEXT,
    finished_at           TEXT,
    error_message         TEXT,
    error_trace           TEXT,
    executed_by           TEXT NOT NULL,
    external_id           TEXT,
    attributes            TEXT NOT NULL DEFAULT '{}',
    created_by            TEXT NOT NULL,
    created_at            TEXT NOT NULL,
    hlc                   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS results_natural_idx
    ON results (run_id, test_key, coalesce(configuration_label, ''), attempt); -- not unique
CREATE INDEX IF NOT EXISTS results_case_idx ON results (test_case_id);

CREATE TABLE IF NOT EXISTS step_results (
    id          TEXT PRIMARY KEY,
    result_id   TEXT NOT NULL REFERENCES results (id),
    position    INTEGER NOT NULL,
    step_id     TEXT,                               -- ADR-0011
    keyword     TEXT,
    text        TEXT NOT NULL,
    status      TEXT NOT NULL,
    actual      TEXT,
    duration_ms INTEGER,
    gherkin_line INTEGER
);

CREATE INDEX IF NOT EXISTS step_results_result_idx ON step_results (result_id, position);

-- Later link of a test without a case (ING-05). id = UUIDv5(NS_UNLINKED_MAPPING,
-- [project_id, test_key]); test_case_id NULL = link withdrawn.
CREATE TABLE IF NOT EXISTS unlinked_mappings (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id   TEXT NOT NULL,
    test_key     TEXT NOT NULL,
    test_case_id TEXT,
    created_by   TEXT NOT NULL,
    updated_by   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    revision     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS unlinked_mappings_key_idx ON unlinked_mappings (project_id, test_key);

-- Manual execution in progress (EJE-02, step 7): local only, never synced.
CREATE TABLE IF NOT EXISTS execution_drafts (
    run_item_id TEXT PRIMARY KEY,
    state       TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- Immutability (design §3.5): the content of a shard, a result or a step result
-- never changes. Only the location (workspace_id, project_id) may move
-- (ADR-0019). The purge is the only code that deletes them.
CREATE TRIGGER IF NOT EXISTS run_shards_append_only
BEFORE UPDATE ON run_shards
WHEN NOT (NEW.id IS OLD.id AND NEW.run_id IS OLD.run_id AND NEW.shard_index IS OLD.shard_index
    AND NEW.shard_total IS OLD.shard_total AND NEW.source_format IS OLD.source_format
    AND NEW.source_file_sha256 IS OLD.source_file_sha256
    AND NEW.source_attachment_id IS OLD.source_attachment_id
    AND NEW.format_version IS OLD.format_version AND NEW.imported_by IS OLD.imported_by
    AND NEW.imported_at IS OLD.imported_at AND NEW.hlc IS OLD.hlc)
BEGIN
    SELECT RAISE(ABORT, 'run_shards is append-only: only its location may change');
END;

CREATE TRIGGER IF NOT EXISTS results_append_only
BEFORE UPDATE ON results
WHEN NOT (NEW.id IS OLD.id AND NEW.run_id IS OLD.run_id AND NEW.shard_id IS OLD.shard_id
    AND NEW.run_item_id IS OLD.run_item_id AND NEW.test_key IS OLD.test_key
    AND NEW.test_case_id IS OLD.test_case_id
    AND NEW.test_case_revision_id IS OLD.test_case_revision_id
    AND NEW.case_revision IS OLD.case_revision AND NEW.case_key IS OLD.case_key
    AND NEW.flow_id IS OLD.flow_id AND NEW.example_row_id IS OLD.example_row_id
    AND NEW.example_row IS OLD.example_row AND NEW.example_values IS OLD.example_values
    AND NEW.configuration_id IS OLD.configuration_id
    AND NEW.configuration_label IS OLD.configuration_label AND NEW.attempt IS OLD.attempt
    AND NEW.status IS OLD.status AND NEW.raw_status IS OLD.raw_status
    AND NEW.duration_ms IS OLD.duration_ms AND NEW.started_at IS OLD.started_at
    AND NEW.finished_at IS OLD.finished_at AND NEW.error_message IS OLD.error_message
    AND NEW.error_trace IS OLD.error_trace AND NEW.executed_by IS OLD.executed_by
    AND NEW.external_id IS OLD.external_id AND NEW.attributes IS OLD.attributes
    AND NEW.created_by IS OLD.created_by AND NEW.created_at IS OLD.created_at
    AND NEW.hlc IS OLD.hlc)
BEGIN
    SELECT RAISE(ABORT, 'results is append-only: only its location may change');
END;

CREATE TRIGGER IF NOT EXISTS step_results_append_only
BEFORE UPDATE ON step_results
BEGIN
    SELECT RAISE(ABORT, 'step_results is append-only');
END;

-- Risk of a requirement (RUN-00, TRZ-04 fields): 1..5 per factor, NULL = not
-- assessed. risk_level = likelihood × impact is derived, never stored.
ALTER TABLE requirements ADD COLUMN risk_likelihood INTEGER
    CHECK (risk_likelihood IS NULL OR risk_likelihood BETWEEN 1 AND 5);
ALTER TABLE requirements ADD COLUMN risk_impact INTEGER
    CHECK (risk_impact IS NULL OR risk_impact BETWEEN 1 AND 5);

-- RUN- and CYC- keys (ADR-0013, DAT-01): the kind CHECK of key_counters (0016)
-- and retired_keys (0017) only allowed case, requirement and defect. SQLite
-- cannot alter a CHECK, so both tables are rebuilt with every row kept.
CREATE TABLE key_counters_0024 (
    project_id TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('case', 'requirement', 'defect', 'run', 'cycle')),
    next_value INTEGER NOT NULL,
    block_end  INTEGER,
    PRIMARY KEY (project_id, kind)
);
INSERT INTO key_counters_0024 (project_id, kind, next_value, block_end)
    SELECT project_id, kind, next_value, block_end FROM key_counters;
DROP TABLE key_counters;
ALTER TABLE key_counters_0024 RENAME TO key_counters;

CREATE TABLE retired_keys_0024 (
    project_id TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('case', 'requirement', 'defect', 'run', 'cycle')),
    key        TEXT NOT NULL,
    retired_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, kind, key)
);
INSERT INTO retired_keys_0024 (project_id, kind, key, retired_at)
    SELECT project_id, kind, key, retired_at FROM retired_keys;
DROP TABLE retired_keys;
ALTER TABLE retired_keys_0024 RENAME TO retired_keys;
