-- Local SQLite schema (Phase 2). Multi-user ready from day 1 (spec §3): every
-- business entity carries workspace_id + audit fields (created_by, updated_by,
-- created_at, updated_at, deleted_at, revision).

CREATE TABLE IF NOT EXISTS workspaces (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces (id),
    display_name TEXT NOT NULL,               -- alias, UI only
    first_name   TEXT NOT NULL,               -- official name (documents)
    last_name    TEXT NOT NULL,               -- official name (documents)
    role         TEXT NOT NULL DEFAULT 'test_manager',
    created_by   TEXT NOT NULL,
    updated_by   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    revision     INTEGER NOT NULL DEFAULT 1
);
