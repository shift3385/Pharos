-- DAT-03 (ADR-0014): the planner attachment BLOBs now live in `evidence/`.
-- Before this file runs, evidence::migrate_planner_attachments has copied every
-- row into the store and into `attachments` (same id). Dropping the table
-- takes the bytes out of the database; db.rs then runs VACUUM so the saved
-- image shrinks. The pre-migration backup (SEC-06) still holds them.

DROP TABLE IF EXISTS planner_attachments;
