-- Case type, automation status and typed custom fields per project (FLD-01,
-- ADR-0018). Additive: no existing row changes.
--
-- `case_type` (standard | checklist) and `automation_status` (manual |
-- to_automate | automated) are nullable: NULL means "never set" and reads as
-- standard / manual. A case revision hashes the stored value (ADR-0011 rule
-- 2), so with NULL every revision written before this migration keeps its
-- hash and id. New cases store explicit values. No CHECK: a pulled value this
-- build does not know must not fail the pull; the repository validates saves.
ALTER TABLE test_cases ADD COLUMN case_type TEXT;
ALTER TABLE test_cases ADD COLUMN automation_status TEXT;

-- Definitions of custom fields, synced as `custom_field` (lww). The id is
-- UUIDv5(NS_CUSTOM_FIELD, "<project_id>:<entity>:<field_key>")
-- (`custom_fields.rs`): two devices that create the same key write the same
-- row, so there is no UNIQUE index (design 0.2.0 §3.4). `field_key` and
-- `field_type` never change after creation; a field is archived, never
-- deleted (only its project's cascade sets `deleted_at`). Values live in each
-- record's `data.custom`, keyed by `field_key`.
CREATE TABLE IF NOT EXISTS custom_fields (
    id                    TEXT PRIMARY KEY,
    workspace_id          TEXT NOT NULL,
    project_id            TEXT NOT NULL,
    entity                TEXT NOT NULL,             -- test_case | requirement | defect | run | test_cycle
    field_key             TEXT NOT NULL,             -- immutable, snake_case
    label                 TEXT NOT NULL,
    description           TEXT NOT NULL DEFAULT '',
    field_type            TEXT NOT NULL,             -- text | long_text | number | integer | date | boolean | select | multi_select | user | url
    options               TEXT NOT NULL DEFAULT '[]', -- [{ id, label, archived }]
    required              INTEGER NOT NULL DEFAULT 0,
    default_value         TEXT,                      -- JSON value, NULL = none
    applies_to_case_types TEXT,                      -- JSON array, NULL = every type
    position              INTEGER NOT NULL DEFAULT 0,
    archived_at           TEXT,
    created_by            TEXT NOT NULL,
    updated_by            TEXT NOT NULL,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    deleted_at            TEXT,
    revision              INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS custom_fields_key_idx ON custom_fields (project_id, entity, field_key);
CREATE INDEX IF NOT EXISTS custom_fields_position_idx ON custom_fields (project_id, entity, position);
