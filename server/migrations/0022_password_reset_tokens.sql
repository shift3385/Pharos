-- 0022_password_reset_tokens: single-use password reset links (SEC-09,
-- ADR-0045). Only the SHA-256 of the token is stored; the token itself travels
-- once, in the email. A token expires (RESET_TOKEN_TTL, 30 minutes by default)
-- and is spent by the first successful use: `used_at` is set in the same
-- statement that checks it. Asking for a new link, or any password change,
-- spends the ones still open. `issued_by` is null for a link the user asked
-- for by email; the workspace admin reset of wave 2 fills it with the admin.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    used_at    timestamptz,
    issued_by  uuid REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
    ON password_reset_tokens (user_id);
