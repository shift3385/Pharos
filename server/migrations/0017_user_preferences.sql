-- Preferences of an account that travel with it between its devices (UX-27,
-- ADR-0038): today the Inicio board. One row per user and key; the value is
-- the client's JSON, versioned by the client itself. The last write wins by
-- the client's `updated_at` (the time of the change, even if it was made
-- offline). Forward-only.

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    key        text        NOT NULL,
    value      jsonb       NOT NULL,
    updated_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, key)
);
