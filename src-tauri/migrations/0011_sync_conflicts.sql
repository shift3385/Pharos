-- Conflict detection + HLC (Phase 8C, SYNC-01/SYNC-03, spec §9). Additive only.
--
-- * oplog.hlc: Hybrid Logical Clock of each local change (wall ms + counter +
--   device id, fixed-width text), so last-write-wins is deterministic across
--   devices with skewed clocks. '' for rows written before this migration.
-- * sync_base: the last version of each entity known to be in sync with the
--   server. A pushed change carries it as `baseRevision`; the server reports a
--   conflict when its copy has moved past that base.
-- * sync_conflicts: a local pending change and a remote change that diverged
--   from the same base. Kept until the user picks a side in the conflict panel.

ALTER TABLE oplog ADD COLUMN hlc TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS sync_base (
    entity    TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    revision  INTEGER NOT NULL,
    hlc       TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (entity, entity_id)
);

-- Backfill: an entity with no pending change matches what was last synced.
-- Entities with pending changes get no base, so their first push falls back to
-- last-write-wins (decision D2).
INSERT OR IGNORE INTO sync_base (entity, entity_id, revision)
    SELECT 'project', id, revision FROM projects
     WHERE id NOT IN (SELECT entity_id FROM oplog WHERE entity = 'project' AND synced_at IS NULL);
INSERT OR IGNORE INTO sync_base (entity, entity_id, revision)
    SELECT 'test_plan', id, revision FROM test_plans
     WHERE id NOT IN (SELECT entity_id FROM oplog WHERE entity = 'test_plan' AND synced_at IS NULL);
INSERT OR IGNORE INTO sync_base (entity, entity_id, revision)
    SELECT 'test_case', id, revision FROM test_cases
     WHERE id NOT IN (SELECT entity_id FROM oplog WHERE entity = 'test_case' AND synced_at IS NULL);

CREATE TABLE IF NOT EXISTS sync_conflicts (
    id              TEXT PRIMARY KEY,
    entity          TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    base_revision   INTEGER,                    -- NULL when no base was known
    local_payload   TEXT NOT NULL DEFAULT 'null',
    local_revision  INTEGER NOT NULL DEFAULT 0,
    local_deleted   INTEGER NOT NULL DEFAULT 0,
    local_hlc       TEXT NOT NULL DEFAULT '',
    remote_payload  TEXT NOT NULL DEFAULT 'null',
    remote_revision INTEGER NOT NULL DEFAULT 0,
    remote_deleted  INTEGER NOT NULL DEFAULT 0,
    remote_hlc      TEXT NOT NULL DEFAULT '',
    detected_at     TEXT NOT NULL,
    resolved_at     TEXT,                       -- NULL while open
    resolution      TEXT                        -- local | remote (SYNC-02 may add merged)
);

-- At most one open conflict per entity.
CREATE UNIQUE INDEX IF NOT EXISTS sync_conflicts_open_idx
    ON sync_conflicts (entity, entity_id) WHERE resolved_at IS NULL;
