-- Live keys are unique per project (DAT-01, ADR-0010). The push refuses an
-- upsert whose key another live document of the same project already uses
-- (`sync.repository.ts`, under the per-user write lock). This index finds that
-- document by the key the payload carries: `scenarioId` (case),
-- `requirementKey` (requirement) or `cardKey` (defect). It is not UNIQUE on
-- purpose: a duplicate must come back to the device as a key conflict, not as
-- a failed transaction.

CREATE INDEX IF NOT EXISTS documents_key_idx
    ON documents (user_id, entity, (payload->>'projectId'),
                  (coalesce(payload->>'scenarioId', payload->>'requirementKey', payload->>'cardKey')))
    WHERE NOT deleted;

-- Repair once the duplicates stored before this check (two devices numbered
-- offline). In each group the document with the lowest entity_id keeps the
-- key; the others get `-dup1`, `-dup2`… — the same rule as the desktop's local
-- migration 0017, so every device ends up with the same keys. Each renamed
-- document gets a new revision and seq, so every device pulls it; its HLC is
-- kept. Provisional keys (`ATS_?KQZD`) are never duplicates. Forward-only.

WITH keyed AS (
    SELECT user_id, entity, entity_id,
           CASE entity WHEN 'test_case' THEN 'scenarioId'
                       WHEN 'requirement' THEN 'requirementKey'
                       ELSE 'cardKey' END AS field,
           coalesce(payload->>'scenarioId', payload->>'requirementKey', payload->>'cardKey') AS key,
           payload->>'projectId' AS project_id
      FROM documents
     WHERE NOT deleted AND entity IN ('test_case', 'requirement', 'planner_card')
), ranked AS (
    SELECT *, row_number() OVER (PARTITION BY user_id, entity, project_id, key ORDER BY entity_id) AS rn
      FROM keyed
     WHERE key IS NOT NULL AND key <> '' AND position('?' IN key) = 0
)
UPDATE documents AS d
   SET payload = jsonb_set(d.payload, ARRAY[r.field], to_jsonb(r.key || '-dup' || (r.rn - 1))),
       revision = d.revision + 1,
       updated_at = now(),
       seq = nextval('documents_seq')
  FROM ranked AS r
 WHERE r.rn > 1
   AND d.user_id = r.user_id AND d.entity = r.entity AND d.entity_id = r.entity_id;
