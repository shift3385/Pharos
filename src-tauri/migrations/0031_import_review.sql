-- Review of step 9 (ING-02..05; ADR-0013 «Implementación (paso 9)»).
--
-- `test_case_revisions.local_only`: 1 for a revision row this device wrote
-- without pushing it (`revisions::ensure_current(.., push = false)`: the
-- state a pull brought, or a provisional key while a key conflict is open).
-- The link resolver (`runs/link.rs`) only reads revisions every device has,
-- so it skips these until the same row arrives by pull (which clears it).
-- Bookkeeping, outside the content hash: the immutability trigger of 0020
-- does not cover it.
--
-- `run_shards.normalizer_version`: the version of the TS parsers that turned
-- the report into Pharos Run JSON. It is part of the shard's content and of
-- its id (`UUIDv5([run, sha256, normalizer_version])`), so devices on the same
-- build converge and two builds never collide under one id; readers keep the
-- shard with the highest version of a run and file. 0 = before this column
-- (no such shard was ever released).

ALTER TABLE test_case_revisions ADD COLUMN local_only INTEGER NOT NULL DEFAULT 0;

ALTER TABLE run_shards ADD COLUMN normalizer_version INTEGER NOT NULL DEFAULT 0;

DROP TRIGGER IF EXISTS run_shards_append_only;
CREATE TRIGGER run_shards_append_only
BEFORE UPDATE ON run_shards
WHEN NOT (NEW.id IS OLD.id AND NEW.run_id IS OLD.run_id AND NEW.shard_index IS OLD.shard_index
    AND NEW.shard_total IS OLD.shard_total AND NEW.source_format IS OLD.source_format
    AND NEW.source_file_sha256 IS OLD.source_file_sha256
    AND NEW.source_attachment_id IS OLD.source_attachment_id
    AND NEW.format_version IS OLD.format_version AND NEW.imported_by IS OLD.imported_by
    AND NEW.imported_at IS OLD.imported_at AND NEW.hlc IS OLD.hlc
    AND NEW.normalizer_version IS OLD.normalizer_version)
BEGIN
    SELECT RAISE(ABORT, 'run_shards is append-only: only its location may change');
END;
