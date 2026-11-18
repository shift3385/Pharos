-- 0027_account_disable: disabling an account (SEC-12, ADR-0045 amendment B).
-- A server administrator disables an account from «Administración ›
-- Usuarios»: it can no longer sign in, refresh, sync or call any route (the
-- check runs on every request), its sessions are revoked, and it stops
-- receiving notifications and counting as an active member. Nothing is
-- deleted: its documents, authorship, memberships and audit trail stay, and
-- clearing `disabled_at` re-enables it. Additive; no data to convert.

ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_by uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_reason text
  CHECK (disabled_reason IS NULL OR char_length(disabled_reason) <= 200);

-- The administrators' list filters by state.
CREATE INDEX IF NOT EXISTS users_disabled_idx ON users (disabled_at) WHERE disabled_at IS NOT NULL;
