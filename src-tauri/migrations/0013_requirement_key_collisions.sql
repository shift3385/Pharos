-- Requirements sync between devices (SYNC-04a, ADR-0020). Keys are numbered
-- locally (highest REQ- + 1), so two devices working offline can both create
-- REQ-004 in the same project. Until DAT-01 makes keys unique across devices,
-- a key that arrives from another device must not make the whole pull fail nor
-- be dropped: both requirements are kept. Creating a requirement on this device
-- still rejects a duplicate key (requirement.rs checks it before inserting).
-- DAT-01 must deduplicate before it restores uniqueness.

DROP INDEX IF EXISTS requirements_project_key_idx;

CREATE INDEX IF NOT EXISTS requirements_project_key_idx
    ON requirements (project_id, requirement_key) WHERE deleted_at IS NULL;
