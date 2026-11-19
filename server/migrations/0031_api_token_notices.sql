-- Notices about API tokens (INT-02 A4, ADR-0052). Forward-only.
--
-- A periodic sweep (`api/tokenNotices.ts`) tells:
--   - the owner, 7 days before a token expires (`token.expiring`), once;
--   - the workspace's Test Managers, when a project token stops working
--     because its owner left the workspace or was disabled
--     (`token.inactive`), once each time it happens.
-- Each column records that its notice was sent, so two server instances
-- never send it twice: the sweep claims a token by setting it.
-- `inactive_notified_at` is cleared when the token works again, so a second
-- departure is told too.

ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS expiry_notified_at timestamptz;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS inactive_notified_at timestamptz;
