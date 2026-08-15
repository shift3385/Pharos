-- Change journal / oplog (Phase 8, spec §9). Every local mutation appends a
-- delta so that, once online, only pending deltas are pushed to the backend and
-- remote ones are pulled. Granularity is per-entity (last-write-wins by
-- revision); a conflict is when both sides changed the same entity since the
-- last sync. `synced_at` NULL means the delta is still pending.

CREATE TABLE IF NOT EXISTS oplog (
    id         TEXT PRIMARY KEY,
    entity     TEXT NOT NULL,              -- project | test_plan | test_case | planner_card | template
    entity_id  TEXT NOT NULL,
    op         TEXT NOT NULL,              -- upsert | delete
    payload    TEXT NOT NULL DEFAULT '{}', -- serialized entity state (for push)
    revision   INTEGER NOT NULL DEFAULT 1,
    author     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    synced_at  TEXT                        -- NULL while pending
);

CREATE INDEX IF NOT EXISTS oplog_pending_idx ON oplog (synced_at);
CREATE INDEX IF NOT EXISTS oplog_entity_idx ON oplog (entity, entity_id);
