-- Notifications on the desktop (RED-W2, ADR-0048). The encrypted copy of
-- what the server delivered to the account, the local ones that never travel
-- (sync conflicts), and the events this device emitted while offline.
-- Kept 90 days and at most 500 per account (`notifications.rs`). Additive.

CREATE TABLE IF NOT EXISTS notifications (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    -- 'server': pulled from the account; 'local': this device only.
    origin       TEXT NOT NULL CHECK (origin IN ('server', 'local')),
    kind         TEXT NOT NULL,
    actor_id     TEXT,
    actor_name   TEXT NOT NULL DEFAULT '',
    workspace_id TEXT,
    project_id   TEXT,
    subject      TEXT NOT NULL DEFAULT '{}',
    data         TEXT NOT NULL DEFAULT '{}',
    dedupe_key   TEXT,
    created_at   TEXT NOT NULL,
    read_at      TEXT,
    -- Read here and not told to the server yet.
    read_pending INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe
    ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_by_user
    ON notifications (user_id, created_at DESC);

-- Events emitted here (`notify`) that the server has not taken yet.
CREATE TABLE IF NOT EXISTS notification_outbox (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- The last server `seq` this device pulled, per account.
CREATE TABLE IF NOT EXISTS notification_cursor (
    user_id TEXT PRIMARY KEY,
    seq     INTEGER NOT NULL DEFAULT 0
);
