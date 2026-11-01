-- Defects as their own documents (DEF-01, ADR-0016). Forward-only.
--
-- The key index of 0006/0008 also covers the `defectKey` of a defect, so a
-- pushed defect key another live defect of the project holds is found
-- (KEY_SQL in sync.repository.ts). Whoever adds a key field after this
-- recreates the index with every field already here (step 6 adds
-- `cycleKey`). Recreated without CONCURRENTLY: the migration runs in a
-- transaction (see changes/DEF-01-servidor.md).
--
-- Then, in the same transaction, the data step `convertPlannerDefects`
-- (src/modules/sync/defects.ts, run by migrate.ts) turns every planner card
-- of kind `defect` into a `defect` document with its links, keeping the
-- card's revision and HLC, and tombstones the card. It is TypeScript because
-- the link ids are UUIDv5, and core Postgres has no SHA-1.

DROP INDEX IF EXISTS documents_key_idx;
CREATE INDEX IF NOT EXISTS documents_key_idx
    ON documents (user_id, entity, (payload->>'projectId'),
                  (coalesce(payload->>'scenarioId', payload->>'requirementKey', payload->>'cardKey',
                            payload->>'runKey', payload->>'defectKey')))
    WHERE NOT deleted;
