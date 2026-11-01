-- CYC- keys (CYC-01, ADR-0017, ADR-0010): a test cycle carries its key in
-- `cycleKey`. The key index of 0006/0008 is rebuilt so it also covers it, and
-- a pushed cycle key another live cycle of the project holds is found
-- (KEY_SQL in sync.repository.ts). `key_blocks` already allows `cycle`
-- (0008). Forward-only. Like 0008, the index is rebuilt without
-- CONCURRENTLY: it holds a lock on `documents` while it builds.

DROP INDEX IF EXISTS documents_key_idx;
CREATE INDEX IF NOT EXISTS documents_key_idx
    ON documents (user_id, entity, (payload->>'projectId'),
                  (coalesce(payload->>'scenarioId', payload->>'requirementKey', payload->>'cardKey',
                            payload->>'runKey', payload->>'cycleKey')))
    WHERE NOT deleted;
