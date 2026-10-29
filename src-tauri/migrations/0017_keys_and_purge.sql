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

-- key_conflicts (DAT-01): a row of this device that lost its key, because the
-- server refused it (another live document of the project has it), a pulled
-- document brought it, or the repair below. The row holds a provisional key
-- meanwhile and is not pushed until the user picks a new key in the conflict
-- panel, the server sends it with a key, or its holder is deleted.
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
    resolution  TEXT               -- renamed | remote | deleted
);

CREATE UNIQUE INDEX IF NOT EXISTS key_conflicts_open_idx
    ON key_conflicts (entity, entity_id) WHERE resolved_at IS NULL;

-- Unique live keys (DAT-01, ADR-0010 rule 6). Keys are numbered from blocks the
-- server leases, so two devices no longer hand out the same one; these indexes
-- are the local safety net. A pulled key that a different live row already
-- uses never fails the pull: the pulled document keeps it and the local row
-- gets a provisional key plus a key conflict (`sync.rs`, `key_sync.rs`).
--
-- A database may already hold duplicates (two devices numbered offline before
-- this version). The repair covers exactly the rows the indexes cover (live,
-- non-empty keys), so creating them can never fail. In each group one row
-- keeps the key: first one the server already has (a sync base exists), then
-- the lowest id, the rule of the server migration 0006. The others:
-- - a row the server already has gets a provisional key and a key conflict.
--   The server repair renames its copy and the next pull settles it; if the
--   server kept the key for it instead (the holder was deleted there), the
--   tombstone of the holder gives it back (`key_sync::holder_deleted`).
--   Nothing diverges in silence (ADR-0010, amendment A3);
-- - a row the server does not have yet gets `-dup1`, `-dup2`… and is pushed
--   with it.

-- Cases.
INSERT INTO key_conflicts (id, user_id, entity, entity_id, project_id, lost_key, taken_by, detected_at)
SELECT lower(hex(randomblob(16))), coalesce(p.owner_id, ''), 'test_case', r.id, r.project_id, r.key,
       r.winner, datetime('now')
  FROM (SELECT x.id, x.project_id, x.scenario_id AS key,
               EXISTS (SELECT 1 FROM sync_base b WHERE b.entity = 'test_case' AND b.entity_id = x.id) AS known,
               row_number() OVER w AS rn, first_value(x.id) OVER w AS winner
          FROM test_cases x
         WHERE x.deleted_at IS NULL AND x.scenario_id <> ''
        WINDOW w AS (PARTITION BY x.project_id, x.scenario_id
                     ORDER BY EXISTS (SELECT 1 FROM sync_base b
                                       WHERE b.entity = 'test_case' AND b.entity_id = x.id) DESC, x.id)) r
  LEFT JOIN projects p ON p.id = r.project_id
 WHERE r.rn > 1 AND r.known;

UPDATE test_cases
   SET scenario_id = scenario_id || '?' || char(65 + abs(random()) % 26, 65 + abs(random()) % 26,
                                               65 + abs(random()) % 26, 65 + abs(random()) % 26)
 WHERE id IN (SELECT entity_id FROM key_conflicts WHERE entity = 'test_case' AND resolved_at IS NULL);

WITH ranked AS (
    SELECT id, scenario_id AS key,
           row_number() OVER (PARTITION BY project_id, scenario_id ORDER BY EXISTS (SELECT 1 FROM sync_base b
                              WHERE b.entity = 'test_case' AND b.entity_id = test_cases.id) DESC, id) AS rn
      FROM test_cases
     WHERE deleted_at IS NULL AND scenario_id <> ''
)
UPDATE test_cases SET scenario_id = (SELECT key || '-dup' || (rn - 1) FROM ranked WHERE ranked.id = test_cases.id)
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Requirements.
INSERT INTO key_conflicts (id, user_id, entity, entity_id, project_id, lost_key, taken_by, detected_at)
SELECT lower(hex(randomblob(16))), coalesce(p.owner_id, ''), 'requirement', r.id, r.project_id, r.key,
       r.winner, datetime('now')
  FROM (SELECT x.id, x.project_id, x.requirement_key AS key,
               EXISTS (SELECT 1 FROM sync_base b WHERE b.entity = 'requirement' AND b.entity_id = x.id) AS known,
               row_number() OVER w AS rn, first_value(x.id) OVER w AS winner
          FROM requirements x
         WHERE x.deleted_at IS NULL AND x.requirement_key <> ''
        WINDOW w AS (PARTITION BY x.project_id, x.requirement_key
                     ORDER BY EXISTS (SELECT 1 FROM sync_base b
                                       WHERE b.entity = 'requirement' AND b.entity_id = x.id) DESC, x.id)) r
  LEFT JOIN projects p ON p.id = r.project_id
 WHERE r.rn > 1 AND r.known;

UPDATE requirements
   SET requirement_key = requirement_key || '?' || char(65 + abs(random()) % 26, 65 + abs(random()) % 26,
                                                       65 + abs(random()) % 26, 65 + abs(random()) % 26)
 WHERE id IN (SELECT entity_id FROM key_conflicts WHERE entity = 'requirement' AND resolved_at IS NULL);

WITH ranked AS (
    SELECT id, requirement_key AS key,
           row_number() OVER (PARTITION BY project_id, requirement_key ORDER BY EXISTS (SELECT 1 FROM sync_base b
                              WHERE b.entity = 'requirement' AND b.entity_id = requirements.id) DESC, id) AS rn
      FROM requirements
     WHERE deleted_at IS NULL AND requirement_key <> ''
)
UPDATE requirements SET requirement_key = (SELECT key || '-dup' || (rn - 1) FROM ranked WHERE ranked.id = requirements.id)
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Defects (planner cards with a key).
INSERT INTO key_conflicts (id, user_id, entity, entity_id, project_id, lost_key, taken_by, detected_at)
SELECT lower(hex(randomblob(16))), r.owner_id, 'planner_card', r.id, r.project_id, r.key,
       r.winner, datetime('now')
  FROM (SELECT x.id, x.project_id, x.owner_id, x.card_key AS key,
               EXISTS (SELECT 1 FROM sync_base b WHERE b.entity = 'planner_card' AND b.entity_id = x.id) AS known,
               row_number() OVER w AS rn, first_value(x.id) OVER w AS winner
          FROM planner_cards x
         WHERE x.deleted_at IS NULL AND x.card_key IS NOT NULL AND x.card_key <> ''
        WINDOW w AS (PARTITION BY x.project_id, x.card_key
                     ORDER BY EXISTS (SELECT 1 FROM sync_base b
                                       WHERE b.entity = 'planner_card' AND b.entity_id = x.id) DESC, x.id)) r
 WHERE r.rn > 1 AND r.known;

UPDATE planner_cards
   SET card_key = card_key || '?' || char(65 + abs(random()) % 26, 65 + abs(random()) % 26,
                                         65 + abs(random()) % 26, 65 + abs(random()) % 26)
 WHERE id IN (SELECT entity_id FROM key_conflicts WHERE entity = 'planner_card' AND resolved_at IS NULL);

WITH ranked AS (
    SELECT id, card_key AS key,
           row_number() OVER (PARTITION BY project_id, card_key ORDER BY EXISTS (SELECT 1 FROM sync_base b
                              WHERE b.entity = 'planner_card' AND b.entity_id = planner_cards.id) DESC, id) AS rn
      FROM planner_cards
     WHERE deleted_at IS NULL AND card_key IS NOT NULL AND card_key <> ''
)
UPDATE planner_cards SET card_key = (SELECT key || '-dup' || (rn - 1) FROM ranked WHERE ranked.id = planner_cards.id)
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- The same conditions as the repair above.
CREATE UNIQUE INDEX IF NOT EXISTS test_cases_project_key_uidx
    ON test_cases (project_id, scenario_id) WHERE deleted_at IS NULL AND scenario_id <> '';
DROP INDEX IF EXISTS requirements_project_key_idx;
CREATE UNIQUE INDEX IF NOT EXISTS requirements_project_key_uidx
    ON requirements (project_id, requirement_key) WHERE deleted_at IS NULL AND requirement_key <> '';
CREATE UNIQUE INDEX IF NOT EXISTS planner_cards_project_key_uidx
    ON planner_cards (project_id, card_key)
    WHERE deleted_at IS NULL AND card_key IS NOT NULL AND card_key <> '';
