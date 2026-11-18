-- Notifications (RED-W2, ADR-0048): what someone did that concerns another
-- person (an invitation, a case sent to review or approved, a defect
-- assigned, a cycle closed). One row per recipient. `seq` is bumped on every
-- insert AND on every read-state change, so each of the recipient's devices
-- pulls what changed since its cursor, read marks included. Kept 90 days and
-- at most 500 per recipient (`notifications.ts`). Forward-only.

CREATE SEQUENCE IF NOT EXISTS notifications_seq;

CREATE TABLE IF NOT EXISTS notifications (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    actor_id     uuid        REFERENCES users (id) ON DELETE SET NULL,
    actor_name   text        NOT NULL DEFAULT '',
    kind         text        NOT NULL,
    workspace_id text,
    project_id   text,
    subject      jsonb       NOT NULL,
    data         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- The same event emitted twice (a retry, a re-fired client event) is
    -- stored once per recipient.
    dedupe_key   text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    read_at      timestamptz,
    seq          bigint      NOT NULL DEFAULT nextval('notifications_seq')
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key
    ON notifications (recipient_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_pull_idx
    ON notifications (recipient_id, seq);

CREATE INDEX IF NOT EXISTS notifications_age_idx
    ON notifications (recipient_id, created_at DESC);
