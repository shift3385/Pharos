-- Heads of the audit chains the server writes itself (AUD-01b, ADR-0015).
-- Every domain write of the web leaves one `audit_event` document, linked into
-- the user's web chain (device 'web', chain workspace 'web', owner = the user);
-- `audit.store.ts` reads its last link here and moves it in the same
-- transaction, under the user's write lock, so two web writes of the same user
-- never take the same `chain_seq`. The events themselves are ordinary
-- `documents` rows; this table only saves a scan per write. Additive and
-- forward-only: nothing to backfill, the web had no events before.

CREATE TABLE IF NOT EXISTS audit_chain_heads (
    user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    device_id          text NOT NULL,
    chain_workspace_id text NOT NULL,
    chain_owner        text NOT NULL,
    seq                bigint NOT NULL,
    hash               text NOT NULL,
    updated_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, device_id, chain_workspace_id, chain_owner)
);
