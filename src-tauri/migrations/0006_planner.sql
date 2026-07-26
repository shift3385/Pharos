-- Local planner (Phase 5, spec §7). A per-project kanban board whose cards are
-- tasks, defects or test data, moved across columns (backlog / in_progress /
-- in_review / done). Attachments are stored as blobs inside the encrypted DB so
-- they stay encrypted at rest and fully offline.

CREATE TABLE IF NOT EXISTS planner_cards (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces (id),
    project_id   TEXT NOT NULL,
    owner_id     TEXT NOT NULL,
    kind         TEXT NOT NULL,              -- task | defect | test_data
    title        TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'backlog',
    priority     TEXT NOT NULL DEFAULT 'medium',
    position     INTEGER NOT NULL DEFAULT 0,
    data         TEXT NOT NULL DEFAULT '{}',
    created_by   TEXT NOT NULL,
    updated_by   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    revision     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS planner_cards_project_idx ON planner_cards (project_id);
CREATE INDEX IF NOT EXISTS planner_cards_owner_idx ON planner_cards (owner_id);

CREATE TABLE IF NOT EXISTS planner_attachments (
    id         TEXT PRIMARY KEY,
    card_id    TEXT NOT NULL REFERENCES planner_cards (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    mime       TEXT,
    bytes      BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS planner_attachments_card_idx
    ON planner_attachments (card_id);
