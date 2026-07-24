-- Ownership: a project belongs to the user that created it, so a second user
-- signing in on the same installation no longer sees someone else's data.
-- Plans and cases inherit visibility through their project.

ALTER TABLE projects ADD COLUMN owner_id TEXT;

CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects (owner_id);

-- Collaboration roles. The schema is prepared here so the sync oplog (Fase 8)
-- is designed with it from the start; the UI and enforcement arrive with the
-- collaboration feature. `owner` is implicit via projects.owner_id.
CREATE TABLE IF NOT EXISTS project_members (
    project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'auditor')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members (user_id);
