-- Defects as their own documents (DEF-01, ADR-0016). Forward-only.
--
-- The key index of 0006/0008 also covers the `defectKey` of a defect, so a
-- pushed defect key another live defect of the project holds is found
-- (KEY_SQL in sync.repository.ts, textually equal to the expression below).
-- It keeps every field already there, `cycleKey` of 0009 (CYC-01) included.
-- Recreated without CONCURRENTLY: the migration runs in a transaction (see
-- changes/DEF-01-servidor.md).
--
-- Then, in the same transaction, the data step `convertPlannerDefects`
-- (src/modules/sync/defects.ts, run by migrate.ts) turns every planner card
-- of kind `defect` into a `defect` document with its links, keeping the
-- card's revision and HLC, and tombstones the card. It is TypeScript because
-- the link ids are UUIDv5, and core Postgres has no SHA-1. It writes one
-- document at a time while the transaction holds the index rebuild's lock on
-- `documents`: sync waits until it ends (a few seconds per thousand defect
-- cards); see changes/DEF-01-servidor.md.

DROP INDEX IF EXISTS documents_key_idx;
CREATE INDEX IF NOT EXISTS documents_key_idx
    ON documents (user_id, entity, (payload->>'projectId'),
                  (coalesce(payload->>'scenarioId', payload->>'requirementKey', payload->>'cardKey',
                            payload->>'runKey', payload->>'cycleKey', payload->>'defectKey')))
    WHERE NOT deleted;
