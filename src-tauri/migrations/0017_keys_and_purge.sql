-- Keys and purge (track A3: SYNC-06, DAT-01; ADR-0010). Forward-only.
--
-- retired_keys (SYNC-06): the key of every case, requirement or defect that the
-- purge removed for good. A purged key still counts as used (ADR-0010 rule 5),
-- so a hand-typed or imported key can never bring it back once its row is gone.

CREATE TABLE IF NOT EXISTS retired_keys (
    project_id TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('case', 'requirement', 'defect')),
    key        TEXT NOT NULL,
    retired_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, kind, key)
);

-- Unique live keys (DAT-01, ADR-0010 rule 6). Keys are numbered from blocks the
-- server leases, so two devices no longer hand out the same one; these indexes
-- are the local safety net. A pulled key that a different live row already
-- uses never fails the pull: the pulled document keeps it and the local row
-- gets a provisional key plus a key conflict (`sync.rs`, `key_sync.rs`).
--
-- A database may already hold duplicates (two devices numbered offline before
-- this version). In each group one row keeps the key: first one the server
-- already has (a sync base exists), then the lowest id, which is the rule the
-- server's migration 0006 uses, so every device ends up with the same keys.
-- The others get `-dup1`, `-dup2`… They are not journaled: the server renames
-- its copies the same way, and a row the server does not have yet is pushed
-- with its new key. Provisional keys (`ATS_?KQZD`) are never duplicates.

WITH ranked AS (
    SELECT id, scenario_id AS key,
           row_number() OVER (
               PARTITION BY project_id, scenario_id
               ORDER BY EXISTS (SELECT 1 FROM sync_base b
                                 WHERE b.entity = 'test_case' AND b.entity_id = test_cases.id) DESC, id
           ) AS rn
      FROM test_cases
     WHERE deleted_at IS NULL AND scenario_id <> '' AND instr(scenario_id, '?') = 0
)
UPDATE test_cases SET scenario_id = (SELECT key || '-dup' || (rn - 1) FROM ranked WHERE ranked.id = test_cases.id)
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

WITH ranked AS (
    SELECT id, requirement_key AS key,
           row_number() OVER (
               PARTITION BY project_id, requirement_key
               ORDER BY EXISTS (SELECT 1 FROM sync_base b
                                 WHERE b.entity = 'requirement' AND b.entity_id = requirements.id) DESC, id
           ) AS rn
      FROM requirements
     WHERE deleted_at IS NULL AND requirement_key <> '' AND instr(requirement_key, '?') = 0
)
UPDATE requirements SET requirement_key = (SELECT key || '-dup' || (rn - 1) FROM ranked WHERE ranked.id = requirements.id)
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

WITH ranked AS (
    SELECT id, card_key AS key,
           row_number() OVER (
               PARTITION BY project_id, card_key
               ORDER BY EXISTS (SELECT 1 FROM sync_base b
                                 WHERE b.entity = 'planner_card' AND b.entity_id = planner_cards.id) DESC, id
           ) AS rn
      FROM planner_cards
     WHERE deleted_at IS NULL AND card_key IS NOT NULL AND card_key <> '' AND instr(card_key, '?') = 0
)
UPDATE planner_cards SET card_key = (SELECT key || '-dup' || (rn - 1) FROM ranked WHERE ranked.id = planner_cards.id)
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS test_cases_project_key_uidx
    ON test_cases (project_id, scenario_id) WHERE deleted_at IS NULL AND scenario_id <> '';
DROP INDEX IF EXISTS requirements_project_key_idx;
CREATE UNIQUE INDEX IF NOT EXISTS requirements_project_key_uidx
    ON requirements (project_id, requirement_key) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS planner_cards_project_key_uidx
    ON planner_cards (project_id, card_key) WHERE deleted_at IS NULL AND card_key IS NOT NULL;

-- key_conflicts (DAT-01): a row of this device that lost its key, because the
-- server refused it (another live document of the project has it) or a pulled
-- document brought it. The row holds a provisional key meanwhile and is not
-- pushed until the user picks a new key in the conflict panel.
CREATE TABLE IF NOT EXISTS key_conflicts (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    entity      TEXT NOT NULL,     -- test_case | requirement | planner_card
    entity_id   TEXT NOT NULL,
    project_id  TEXT NOT NULL,
    lost_key    TEXT NOT NULL,     -- the key it wanted
    taken_by    TEXT NOT NULL DEFAULT '', -- the entity that holds it, when known
    detected_at TEXT NOT NULL,
    resolved_at TEXT,              -- NULL while open
    resolution  TEXT               -- renamed | remote
);

CREATE UNIQUE INDEX IF NOT EXISTS key_conflicts_open_idx
    ON key_conflicts (entity, entity_id) WHERE resolved_at IS NULL;
