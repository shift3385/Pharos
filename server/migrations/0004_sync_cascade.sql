-- Project deletes cascade in the sync store (FIX-05, ADR-0020). From now on
-- the server tombstones the plans, cases, requirements and planner cards of a
-- project when it accepts the project's delete; this index finds them by the
-- `projectId` their payload carries.
--
-- Before this fix only the project tombstone was stored, so children of
-- already-deleted projects are still live here and would come back on every
-- device. Repair them once, the same way: a tombstone with a new seq (so every
-- client pulls it) and the project's delete HLC. Forward-only; nothing is
-- removed, the rows are only marked deleted.

CREATE INDEX IF NOT EXISTS documents_project_idx
    ON documents (user_id, (payload->>'projectId'));

UPDATE documents AS c
   SET deleted = true,
       revision = c.revision + 1,
       hlc = p.hlc,
       updated_at = now(),
       seq = nextval('documents_seq')
  FROM documents AS p
 WHERE p.user_id = c.user_id
   AND p.entity = 'project'
   AND p.deleted
   AND c.entity IN ('test_plan', 'test_case', 'requirement', 'planner_card')
   AND NOT c.deleted
   AND c.payload->>'projectId' = p.entity_id;
