-- 0021_account_recovery_codes: account recovery codes (SEC-08, ADR-0045).
-- Ten single-use codes per account, shown once (at sign-up or when the user
-- generates new ones) and kept only as an Argon2id hash. Generating new codes
-- deletes the old ones. `account_recovery_attempts` counts wrong codes per
-- account, so guessing is limited per account as well as per client IP.
-- `users.password_changed_at` records the last change (null: never changed).
-- Additive and forward-only: existing accounts simply have no codes yet.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

CREATE TABLE IF NOT EXISTS account_recovery_codes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash  text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    used_at    timestamptz
);

CREATE INDEX IF NOT EXISTS account_recovery_codes_user_idx
    ON account_recovery_codes (user_id);

CREATE TABLE IF NOT EXISTS account_recovery_attempts (
    user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    failures     integer NOT NULL DEFAULT 0,
    window_start timestamptz NOT NULL DEFAULT now(),
    locked_until timestamptz
);
