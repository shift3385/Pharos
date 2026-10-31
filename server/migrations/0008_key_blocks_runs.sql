-- RUN- and CYC- keys (EJE-01, ADR-0013, ADR-0010): key blocks are leased for
-- runs now and for cycles with step 6 (ADR-0017). The kind CHECK of 0005 only
-- allowed case, requirement and defect; it is replaced by one that also
-- allows run and cycle. Every row is kept. The key index of 0006 also covers
-- the `runKey` of a run, so a pushed run key another live run of the project
-- holds is found (KEY_SQL in sync.repository.ts). Forward-only.
--
-- The execution entities themselves travel as `documents` (design 0.2.0
-- §3.11): no table or index until the API and the web query results (INT-02).

ALTER TABLE key_blocks DROP CONSTRAINT IF EXISTS key_blocks_kind_check;
ALTER TABLE key_blocks ADD CONSTRAINT key_blocks_kind_check
    CHECK (kind IN ('case', 'requirement', 'defect', 'run', 'cycle'));

DROP INDEX IF EXISTS documents_key_idx;
CREATE INDEX IF NOT EXISTS documents_key_idx
    ON documents (user_id, entity, (payload->>'projectId'),
                  (coalesce(payload->>'scenarioId', payload->>'requirementKey', payload->>'cardKey',
                            payload->>'runKey')))
    WHERE NOT deleted;
