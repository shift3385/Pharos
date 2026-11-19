-- 0047_field_merge: field-level merge of sync conflicts (SYNC-02, ADR-0051).
--
-- sync_base.base_payload: the content of the version this device last had
-- in sync with the server, kept only while the entity has pending changes:
-- written by journal::record when the first local change after a sync is
-- recorded (the change's `before`), cleared whenever the base moves. It is
-- the third side of the merge; without it (changes pending from before this
-- migration) a conflict stays per entity, as before.
--
-- sync_conflicts.merge: what the merge found (JSON): the fields combined
-- without asking (`origins`), the keys still in conflict (`conflicts`), or
-- the guard that keeps the conflict per entity (`guard`). NULL for the
-- conflicts opened before this migration. `resolution` may now also be
-- `merged`.
--
-- Additive; no data to convert.

ALTER TABLE sync_base ADD COLUMN base_payload TEXT;
ALTER TABLE sync_conflicts ADD COLUMN merge TEXT;
