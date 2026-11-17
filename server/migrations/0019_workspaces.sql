-- Workspaces with roles (SYNC-07, ADR-0019 revised by ADR-0042 §4).
-- Forward-only; the migrator runs this file in one transaction.
--
-- Before: `documents` is per user (PK user_id, entity, entity_id). After: per
-- workspace (PK workspace_id, entity, entity_id). Every user gets a
-- `personal` workspace holding exactly what they had, so the change of key is
-- a bijection: (user, entity, id) -> (personal(user), entity, id).
-- `documents.user_id` becomes `author_user_id` (who stored the last version),
-- nullable and without ON DELETE CASCADE: deleting an account must never
-- delete what a team shares. The rebuild of the primary key and the indexes
-- holds a lock on `documents` until it ends: sync waits meanwhile (see
-- changes/SYNC-07-servidor.md).

CREATE TABLE IF NOT EXISTS workspaces (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    kind       text NOT NULL CHECK (kind IN ('personal', 'shared')),
    created_by uuid NOT NULL REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
-- One personal workspace per user.
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_personal_idx ON workspaces (created_by) WHERE kind = 'personal';

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role         text NOT NULL CHECK (role IN ('test_manager', 'test_analyst', 'automation_engineer', 'product_owner', 'viewer')),
    added_by     uuid,
    added_at     timestamptz NOT NULL DEFAULT now(),
    removed_at   timestamptz,
    PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members (user_id) WHERE removed_at IS NULL;

-- An invitation is a one-time code; only its SHA-256 is stored, like the
-- refresh tokens. `note` is the inviter's own reminder (an e-mail, a name):
-- the code is what counts.
CREATE TABLE IF NOT EXISTS workspace_invitations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    role        text NOT NULL CHECK (role IN ('test_manager', 'test_analyst', 'automation_engineer', 'product_owner', 'viewer')),
    token_hash  text NOT NULL UNIQUE,
    note        text,
    invited_by  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    accepted_by uuid REFERENCES users (id) ON DELETE SET NULL,
    accepted_at timestamptz,
    revoked_at  timestamptz
);
CREATE INDEX IF NOT EXISTS workspace_invitations_ws_idx ON workspace_invitations (workspace_id);

-- Every user, with or without documents, gets a personal workspace in which
-- they are Test Manager; a trigger does the same for every new account, so
-- registration needs no special case.
INSERT INTO workspaces (name, kind, created_by)
SELECT 'Personal', 'personal', u.id FROM users u
 WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.created_by = u.id AND w.kind = 'personal');
INSERT INTO workspace_members (workspace_id, user_id, role, added_by)
SELECT w.id, w.created_by, 'test_manager', w.created_by FROM workspaces w
 WHERE w.kind = 'personal'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pharos_create_personal_workspace() RETURNS trigger AS $$
DECLARE ws uuid;
BEGIN
    INSERT INTO workspaces (name, kind, created_by) VALUES ('Personal', 'personal', NEW.id) RETURNING id INTO ws;
    INSERT INTO workspace_members (workspace_id, user_id, role, added_by) VALUES (ws, NEW.id, 'test_manager', NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_personal_workspace ON users;
CREATE TRIGGER users_personal_workspace AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION pharos_create_personal_workspace();

-- documents: per workspace.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS workspace_id uuid;
UPDATE documents d
   SET workspace_id = w.id,
       -- The location every payload carries meant nothing so far (a random id
       -- per device, or "local" from the web). It is outside the content of
       -- append-only documents and outside the audit hash (`LOCATION_KEYS`).
       payload = CASE WHEN d.payload ? 'workspaceId'
                      THEN jsonb_set(d.payload, '{workspaceId}', to_jsonb(w.id::text))
                      ELSE d.payload END
  FROM workspaces w
 WHERE w.kind = 'personal' AND w.created_by = d.user_id;
ALTER TABLE documents ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE documents ADD CONSTRAINT documents_workspace_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces (id);

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_user_id_fkey;
ALTER TABLE documents DROP CONSTRAINT documents_pkey;
ALTER TABLE documents RENAME COLUMN user_id TO author_user_id;
ALTER TABLE documents ALTER COLUMN author_user_id DROP NOT NULL;
ALTER TABLE documents ADD PRIMARY KEY (workspace_id, entity, entity_id);

DROP INDEX IF EXISTS documents_pull_idx;
CREATE INDEX documents_pull_idx ON documents (workspace_id, seq);
DROP INDEX IF EXISTS documents_project_idx;
CREATE INDEX documents_project_idx ON documents (workspace_id, (payload->>'projectId'));
DROP INDEX IF EXISTS documents_key_idx;
CREATE INDEX documents_key_idx
    ON documents (workspace_id, entity, (payload->>'projectId'),
                  (coalesce(payload->>'scenarioId', payload->>'requirementKey', payload->>'cardKey',
                            payload->>'runKey', payload->>'cycleKey', payload->>'defectKey')))
    WHERE NOT deleted;
-- Where an entity lives, whatever the workspace (a push to the wrong one is
-- answered `moved` or `not_found`, ADR-0042 §2).
CREATE INDEX documents_entity_idx ON documents (entity, entity_id);

-- Key blocks belong to the project's workspace: any member who may create
-- that kind of key leases them.
ALTER TABLE key_blocks ADD COLUMN IF NOT EXISTS workspace_id uuid;
UPDATE key_blocks k SET workspace_id = w.id
  FROM workspaces w WHERE w.kind = 'personal' AND w.created_by = k.owner_id;
ALTER TABLE key_blocks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE key_blocks ADD CONSTRAINT key_blocks_workspace_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces (id);
ALTER TABLE key_blocks DROP COLUMN owner_id;

-- The web's audit chains: one per (user, workspace) from now on, with the
-- workspace id as chain workspace. The old chain "web" of each user stays,
-- closed, in their personal workspace and still verifies.
ALTER TABLE audit_chain_heads ADD COLUMN IF NOT EXISTS workspace_id uuid;
UPDATE audit_chain_heads h SET workspace_id = w.id
  FROM workspaces w WHERE w.kind = 'personal' AND w.created_by = h.user_id;
ALTER TABLE audit_chain_heads ALTER COLUMN workspace_id SET NOT NULL;
