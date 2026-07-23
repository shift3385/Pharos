-- Projects (container/folder). A project holds one test plan and its test cases
-- (spec §5.1: the test plan is the project's definition). The per-project case id
-- numbering config lives here: a literal prefix (e.g. 'ATS_', 'FT', 'TC-') and a
-- zero-padding width. Test plans and test cases gain a `project_id` so both are
-- scoped to their project.

CREATE TABLE IF NOT EXISTS projects (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL REFERENCES workspaces (id),
    name           TEXT NOT NULL,
    case_id_prefix TEXT NOT NULL DEFAULT 'ATS_',
    case_id_digits INTEGER NOT NULL DEFAULT 3,
    created_by     TEXT NOT NULL,
    updated_by     TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT,
    revision       INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects (workspace_id);

ALTER TABLE test_plans ADD COLUMN project_id TEXT;
ALTER TABLE test_cases ADD COLUMN project_id TEXT;

CREATE INDEX IF NOT EXISTS test_plans_project_idx ON test_plans (project_id);
CREATE INDEX IF NOT EXISTS test_cases_project_idx ON test_cases (project_id);
