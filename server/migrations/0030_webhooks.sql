-- Outgoing webhooks (INT-03, ADR-0052 §4). Forward-only.
--
-- A webhook belongs to a workspace (optionally to one of its projects) and
-- names the events it wants. Its signing secret must be read to sign, so it
-- is stored encrypted (AES-256-GCM, KEK `WEBHOOK_SECRETS_KEY` outside the
-- database, as ADR-0034 does for AI keys); during a rotation the previous
-- secret keeps signing until `previous_until`.
--
-- `webhook_deliveries` is the outbox: a row is written in the same
-- transaction as the document change that caused it, so no event is lost or
-- invented; the dispatcher sends it and records the answer. Kept 30 days.

CREATE TABLE IF NOT EXISTS webhooks (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL REFERENCES workspaces (id),
    project_id           text,
    name                 text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    url                  text NOT NULL CHECK (length(url) <= 2000),
    events               text[] NOT NULL CHECK (cardinality(events) > 0),
    secret_nonce         bytea NOT NULL,
    secret_ciphertext    bytea NOT NULL,
    secret_kek_id        text NOT NULL,
    previous_nonce       bytea,
    previous_ciphertext  bytea,
    previous_kek_id      text,
    previous_until       timestamptz,
    active               boolean NOT NULL DEFAULT true,
    consecutive_failures integer NOT NULL DEFAULT 0,
    disabled_at          timestamptz,
    disabled_reason      text CHECK (disabled_reason IN ('manual', 'failures')),
    created_by           uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    deleted_at           timestamptz
);

CREATE INDEX IF NOT EXISTS webhooks_workspace_idx ON webhooks (workspace_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id       uuid NOT NULL REFERENCES webhooks (id) ON DELETE CASCADE,
    event_id         uuid NOT NULL,
    event_type       text NOT NULL,
    payload          jsonb NOT NULL,
    status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'delivered', 'failed', 'abandoned')),
    attempt          integer NOT NULL DEFAULT 0,
    next_attempt_at  timestamptz NOT NULL DEFAULT now(),
    last_status      integer,
    last_error       text,
    last_duration_ms integer,
    last_response    text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    delivered_at     timestamptz
);

-- What the dispatcher picks: the due ones.
CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx
    ON webhook_deliveries (next_attempt_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS webhook_deliveries_hook_idx ON webhook_deliveries (webhook_id, created_at DESC);
