-- Template space (Phase 6B, spec §6). An internal repository of .xlsx templates
-- (plan / case), preloaded with the bundled PHAROS templates and extensible by
-- importing more. Each template carries metadata (name, description, usage
-- prompt for the AI, version) and the raw .xlsx bytes stored as a blob so the
-- repository works fully offline. Built-in templates cannot be deleted.

CREATE TABLE IF NOT EXISTS templates (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces (id),
    kind         TEXT NOT NULL,              -- plan | case
    language     TEXT NOT NULL,              -- es | en
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    usage_prompt TEXT NOT NULL DEFAULT '',
    version      TEXT NOT NULL DEFAULT '1.0',
    file         BLOB NOT NULL,
    is_builtin   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    revision     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS templates_kind_idx ON templates (kind);
