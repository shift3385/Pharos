-- 0028_revision_tombstones: case revisions follow their project's delete
-- (SYNC-11, ADR-0051). From now on the cascade of a project delete also
-- tombstones its `test_case_revision` documents (`REVISION_TOMBSTONE_SQL`),
-- marked `deletedWith`, so they come back if the project does and
-- `compactTombstones` clears their content with the rest.
--
-- Before, revisions of deleted projects stayed live on the server. Repair
-- them once, as 0004 repaired the other children: a tombstone with a new seq
-- (every client pulls it; an append-only tombstone changes nothing on a
-- device), an HLC that never goes backwards, and the same exception as the
-- cascade: a revision a live result or run item of another project points to
-- stays. A move's tombstone (`movedTo`) is not a delete: its revisions
-- moved with it. Forward-only; nothing is removed.

UPDATE documents AS r
   SET deleted = true,
       payload = r.payload || jsonb_build_object('deletedWith', p.entity_id),
       revision = r.revision + 1,
       hlc = GREATEST(r.hlc, p.hlc),
       updated_at = now(),
       seq = nextval('documents_seq')
  FROM documents AS p
 WHERE p.workspace_id = r.workspace_id
   AND p.entity = 'project'
   AND p.deleted
   AND NOT (p.payload ? 'movedTo')
   AND r.entity = 'test_case_revision'
   AND NOT r.deleted
   AND r.payload->>'projectId' = p.entity_id
   AND NOT EXISTS (
     SELECT 1 FROM documents o
      WHERE o.workspace_id = r.workspace_id
        AND o.entity IN ('result', 'run_item')
        AND NOT o.deleted
        AND o.payload->>'testCaseRevisionId' = r.entity_id
        AND o.payload->>'projectId' IS DISTINCT FROM p.entity_id);
