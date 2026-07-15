-- 0001_init: authentication schema (Phase 1).
-- Users carry the official profile fields (spec §3): display_name (UI only) plus
-- mandatory first_name/last_name used in official documents. Refresh tokens are
-- stored hashed with rotation support.

CREATE TABLE IF NOT EXISTS users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL,
    password_hash text NOT NULL,
    display_name  text NOT NULL,
    first_name    text NOT NULL,
    last_name     text NOT NULL,
    role          text NOT NULL DEFAULT 'test_manager',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness on email (stored already lowercased by the app).
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
    ON users (lower(email));

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  text NOT NULL UNIQUE,
    expires_at  timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    revoked_at  timestamptz,
    replaced_by uuid REFERENCES refresh_tokens (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx
    ON refresh_tokens (user_id);
