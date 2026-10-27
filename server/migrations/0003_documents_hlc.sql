-- HLC per document (SYNC-01, Phase 8C, spec §9). The Hybrid Logical Clock of
-- the change that produced the stored version (fixed-width text: wall ms +
-- counter + device id). Used to detect retried pushes, to check a delta's base
-- (conflict detection) and for deterministic last-write-wins when a delta has
-- no base. '' for documents written before this migration.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS hlc text NOT NULL DEFAULT '';
