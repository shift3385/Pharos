-- Configurations, test cycles and cycle items (CYC-01, ADR-0017; design 0.2.0
-- §5 step 6). Additive: no existing row changes. Forward-only.
--
-- All three tables are `lww` (src-tauri/src/cycles.rs), carry `project_id` and
-- belong to the project's owner (ADR-0020 rule 1). Unlike the ADR sketch:
-- - no foreign key test_cycle_items → test_cycles: a pull can bring an item
--   before its cycle, and the bundled SQLite enforces foreign keys, so the
--   whole pull would fail (the lesson of 0020 and 0024). The repository
--   checks the link;
-- - no CHECK on `test_cycles.status`: a pulled value this build does not know
--   must not fail the pull (0026); the repository validates saves;
-- - `configurations.position` orders them in pickers and in the progress
--   columns.
-- No UNIQUE index besides the primary key on synced rows (design §3.4),
-- except the live cycle key, like the other keys (0010, 0017, 0024). The kind
-- `cycle` is already allowed in key_counters and retired_keys (0024).

-- Where a cycle runs: "Chrome · Windows 11". `match_labels` are the texts an
-- import recognizes it by (`chromium`, a Playwright project name). Archived,
-- never deleted: runs and results point at it (only the project cascade sets
-- `deleted_at`).
CREATE TABLE IF NOT EXISTS configurations (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id   TEXT NOT NULL,
    name         TEXT NOT NULL,
    attributes   TEXT NOT NULL DEFAULT '{}',   -- { browser, os, device, locale }
    match_labels TEXT NOT NULL DEFAULT '[]',   -- ["chromium", "Desktop Chrome"]
    position     INTEGER NOT NULL DEFAULT 0,
    archived_at  TEXT,
    created_by   TEXT NOT NULL,
    updated_by   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    revision     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS configurations_project_idx ON configurations (project_id, position);

-- What (items), where (configurations), against what (build, environment)
-- and when (dates, plan milestone and sprint as text).
CREATE TABLE IF NOT EXISTS test_cycles (
    id                TEXT PRIMARY KEY,
    workspace_id      TEXT NOT NULL,
    project_id        TEXT NOT NULL,
    cycle_key         TEXT NOT NULL,             -- CYC-001 (DAT-01)
    title             TEXT NOT NULL,
    description       TEXT NOT NULL DEFAULT '',
    test_plan_id      TEXT,
    milestone         TEXT,
    sprint            TEXT,
    build             TEXT,
    environment       TEXT,
    configuration_ids TEXT NOT NULL DEFAULT '[]',
    starts_on         TEXT,                      -- YYYY-MM-DD
    ends_on           TEXT,
    status            TEXT NOT NULL DEFAULT 'planned', -- planned | active | closed
    data              TEXT NOT NULL DEFAULT '{}',      -- custom fields (ADR-0018)
    created_by        TEXT NOT NULL,
    updated_by        TEXT NOT NULL,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    deleted_at        TEXT,
    revision          INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS test_cycles_project_idx ON test_cycles (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS test_cycles_project_key_idx
    ON test_cycles (project_id, cycle_key) WHERE deleted_at IS NULL;

-- One case of a cycle, with its assignee; optionally one flow or Outline row
-- (NULL = every flow / every row). Its own entity, so two people adding
-- different cases to one cycle never conflict (ADR-0017).
CREATE TABLE IF NOT EXISTS test_cycle_items (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL,
    cycle_id       TEXT NOT NULL,
    project_id     TEXT NOT NULL,
    test_case_id   TEXT NOT NULL,
    flow_id        TEXT,
    example_row_id TEXT,
    assignee       TEXT,
    position       INTEGER NOT NULL DEFAULT 0,
    created_by     TEXT NOT NULL,
    updated_by     TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT,
    revision       INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS test_cycle_items_cycle_idx ON test_cycle_items (cycle_id, position);
CREATE INDEX IF NOT EXISTS test_cycle_items_case_idx ON test_cycle_items (test_case_id);

-- The runs of a cycle (progress, the cycle's runs tab).
CREATE INDEX IF NOT EXISTS runs_cycle_idx ON runs (cycle_id);
