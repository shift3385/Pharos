-- Test cases (Phase 4, spec §5.3). Scalars/searchable are columns; the rest of
-- the template + ISTQB attributes live in `data` (JSON). Revisions snapshot per
-- saved version, like test plans.

CREATE TABLE IF NOT EXISTS test_cases (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces (id),
    scenario_id  TEXT NOT NULL,              -- e.g. ATS_001
    title        TEXT NOT NULL,
    version      TEXT NOT NULL DEFAULT '1.0',
    status       TEXT NOT NULL DEFAULT 'draft',
    priority     TEXT NOT NULL DEFAULT 'medium',
    author       TEXT NOT NULL,
    data         TEXT NOT NULL DEFAULT '{}',
    created_by   TEXT NOT NULL,
    updated_by   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    revision     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS test_cases_workspace_idx ON test_cases (workspace_id);

CREATE TABLE IF NOT EXISTS test_case_revisions (
    id           TEXT PRIMARY KEY,
    test_case_id TEXT NOT NULL REFERENCES test_cases (id) ON DELETE CASCADE,
    revision     INTEGER NOT NULL,
    title        TEXT NOT NULL,
    data         TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    created_by   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS test_case_revisions_case_idx
    ON test_case_revisions (test_case_id);
