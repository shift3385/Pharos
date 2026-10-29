-- Templates per user (FIX-08b). Until now every account signed in on this
-- device saw, edited and deleted the same user templates. `owner_id` is the
-- account that imported a template; NULL for the built-in ones, which ship with
-- the app and every account sees. Forward-only; no row is dropped.
--
-- Existing user templates have no recorded owner. On a device whose projects
-- all belong to one account (the usual case) they go to that account; on any
-- other device they stay NULL and the first account that opens Templates takes
-- them (template.rs, `claim_unowned`).

ALTER TABLE templates ADD COLUMN owner_id TEXT;

UPDATE templates
   SET owner_id = (SELECT min(owner_id) FROM projects WHERE owner_id IS NOT NULL AND owner_id <> '')
 WHERE is_builtin = 0
   AND (SELECT count(DISTINCT owner_id) FROM projects
         WHERE owner_id IS NOT NULL AND owner_id <> '') = 1;

-- Their journal rows belong to the same account (FIX-07).
UPDATE oplog
   SET user_id = coalesce((SELECT owner_id FROM templates WHERE id = oplog.entity_id), '')
 WHERE entity = 'template' AND user_id = '';

CREATE INDEX IF NOT EXISTS templates_owner_idx ON templates (owner_id);
