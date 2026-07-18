-- Test plans (Phase 3, spec §5.1). Searchable/scalar fields are promoted to
-- columns; the full 21-step content lives in `data` (JSON) so the shape can grow
-- without a migration. `test_plan_revisions` keeps a snapshot per saved revision.

CREATE TABLE IF NOT EXISTS test_plans (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces (id),
    title        TEXT NOT NULL,
    version      TEXT NOT NULL DEFAULT '1.0',
    plan_date    TEXT,
    author       TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'draft',
    data         TEXT NOT NULL DEFAULT '{}',
    created_by   TEXT NOT NULL,
    updated_by   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    revision     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS test_plans_workspace_idx ON test_plans (workspace_id);

CREATE TABLE IF NOT EXISTS test_plan_revisions (
    id           TEXT PRIMARY KEY,
    test_plan_id TEXT NOT NULL REFERENCES test_plans (id) ON DELETE CASCADE,
    revision     INTEGER NOT NULL,
    title        TEXT NOT NULL,
    data         TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    created_by   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS test_plan_revisions_plan_idx
    ON test_plan_revisions (test_plan_id);
