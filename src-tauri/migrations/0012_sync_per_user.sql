-- Sync state per user (FIX-07, ADR-0020). Several accounts can sign in on the
-- same installation; the oplog, the sync bases and the conflicts must belong to
-- the account whose server store they sync with, so user B never pushes user
-- A's pending changes with B's token. Forward-only; no row is dropped.
--
-- The user of a change is the owner of the entity it touches (projects.owner_id,
-- the project of a plan/case/requirement, planner_cards.owner_id). Rows whose
-- owner cannot be derived (templates, legacy rows without a project) get '' and
-- are kept, but never pushed nor counted as pending.

ALTER TABLE oplog ADD COLUMN user_id TEXT NOT NULL DEFAULT '';

UPDATE oplog SET user_id = coalesce(
    CASE entity
        WHEN 'project' THEN (SELECT owner_id FROM projects WHERE id = oplog.entity_id)
        WHEN 'test_plan' THEN (SELECT p.owner_id FROM test_plans x JOIN projects p ON p.id = x.project_id
                                WHERE x.id = oplog.entity_id)
        WHEN 'test_case' THEN (SELECT p.owner_id FROM test_cases x JOIN projects p ON p.id = x.project_id
                                WHERE x.id = oplog.entity_id)
        WHEN 'requirement' THEN (SELECT p.owner_id FROM requirements x JOIN projects p ON p.id = x.project_id
                                  WHERE x.id = oplog.entity_id)
        WHEN 'planner_card' THEN (SELECT owner_id FROM planner_cards WHERE id = oplog.entity_id)
    END, '');

CREATE INDEX IF NOT EXISTS oplog_user_pending_idx ON oplog (user_id, synced_at);

-- sync_base gains the user in its primary key: SQLite cannot alter a primary
-- key, so the table is rebuilt with every row copied.
CREATE TABLE sync_base_v2 (
    user_id   TEXT NOT NULL DEFAULT '',
    entity    TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    revision  INTEGER NOT NULL,
    hlc       TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, entity, entity_id)
);

INSERT INTO sync_base_v2 (user_id, entity, entity_id, revision, hlc)
SELECT coalesce(
    CASE b.entity
        WHEN 'project' THEN (SELECT owner_id FROM projects WHERE id = b.entity_id)
        WHEN 'test_plan' THEN (SELECT p.owner_id FROM test_plans x JOIN projects p ON p.id = x.project_id
                                WHERE x.id = b.entity_id)
        WHEN 'test_case' THEN (SELECT p.owner_id FROM test_cases x JOIN projects p ON p.id = x.project_id
                                WHERE x.id = b.entity_id)
        WHEN 'requirement' THEN (SELECT p.owner_id FROM requirements x JOIN projects p ON p.id = x.project_id
                                  WHERE x.id = b.entity_id)
        WHEN 'planner_card' THEN (SELECT owner_id FROM planner_cards WHERE id = b.entity_id)
    END, ''), b.entity, b.entity_id, b.revision, b.hlc
FROM sync_base b;

DROP TABLE sync_base;
ALTER TABLE sync_base_v2 RENAME TO sync_base;

ALTER TABLE sync_conflicts ADD COLUMN user_id TEXT NOT NULL DEFAULT '';

UPDATE sync_conflicts SET user_id = coalesce(
    CASE entity
        WHEN 'project' THEN (SELECT owner_id FROM projects WHERE id = sync_conflicts.entity_id)
        WHEN 'test_plan' THEN (SELECT p.owner_id FROM test_plans x JOIN projects p ON p.id = x.project_id
                                WHERE x.id = sync_conflicts.entity_id)
        WHEN 'test_case' THEN (SELECT p.owner_id FROM test_cases x JOIN projects p ON p.id = x.project_id
                                WHERE x.id = sync_conflicts.entity_id)
    END, '');

-- The pull cursor becomes `cursor:<user_id>`. The old global cursor cannot be
-- attributed to one account; each account re-pulls from 0 once, which is
-- idempotent (a document equal to its sync base is skipped).
DELETE FROM sync_state WHERE key = 'cursor';
