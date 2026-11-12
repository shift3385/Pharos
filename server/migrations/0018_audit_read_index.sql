-- Administración › Auditoría on the web (AUD-01, ADR-0015 «Enmienda AUD-01»):
-- the list reads an account's `audit_event` documents newest first, filtered
-- by date. A partial index keeps that read from scanning every document of
-- the account. Additive and forward-only.

CREATE INDEX IF NOT EXISTS documents_audit_at_idx
    ON documents (user_id, (payload->>'at') DESC)
    WHERE entity = 'audit_event';
