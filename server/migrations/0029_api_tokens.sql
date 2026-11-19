-- API tokens for the public API /api/v1 (INT-02, ADR-0052). Forward-only.
--
-- Two kinds:
--   - 'project': for CI. Bound to one project and its workspace; created by a
--     Test Manager (capability token.manage).
--   - 'personal': a personal access token (PAT) for one person's CLI. It may
--     be limited to one workspace (workspace_id) or reach all of theirs (NULL).
--
-- Only the SHA-256 of the whole token is stored, like refresh tokens and
-- invitations: ~190 random bits make a slow hash pointless. `display_prefix`
-- is what the lists show to recognise a token.
--
-- A token acts as its owner: every request checks, in the database, that the
-- owner is still an active member whose current role has the capability the
-- scope needs. Nothing here is cached.

CREATE TABLE IF NOT EXISTS api_tokens (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind           text NOT NULL CHECK (kind IN ('project', 'personal')),
    name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    display_prefix text NOT NULL,
    token_hash     text NOT NULL UNIQUE,
    owner_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    workspace_id   uuid REFERENCES workspaces (id),
    project_id     text,
    scopes         text[] NOT NULL CHECK (cardinality(scopes) > 0),
    created_by     uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL,
    last_used_at   timestamptz,
    last_used_ip   text,
    revoked_at     timestamptz,
    revoked_by     uuid REFERENCES users (id) ON DELETE SET NULL,
    revoke_reason  text CHECK (revoke_reason IN ('manual', 'admin', 'rotated')),
    -- The token that replaced this one when it was rotated.
    rotated_to     uuid REFERENCES api_tokens (id),
    CHECK (kind = 'personal' OR (workspace_id IS NOT NULL AND project_id IS NOT NULL)),
    CHECK (kind = 'project' OR project_id IS NULL),
    CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);

CREATE INDEX IF NOT EXISTS api_tokens_workspace_idx ON api_tokens (workspace_id) WHERE kind = 'project';
CREATE INDEX IF NOT EXISTS api_tokens_owner_idx ON api_tokens (owner_user_id);
