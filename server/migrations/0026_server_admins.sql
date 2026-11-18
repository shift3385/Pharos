-- 0026_server_admins: the server administrator (SEC-11, ADR-0045 amendment).
-- An instance-level role, apart from the workspace roles (a Test Manager is
-- not an administrator): an administrator lists the server's accounts,
-- resets their passwords with a single-use link (SEC-09) and names or removes
-- other administrators. The old `users.role` column always holds
-- 'test_manager' and authorizes nothing; it is not reused.
--
-- Who is one: the first account registered on a server without any, the
-- emails in PHAROS_ADMINS (named at start-up and at sign-up; never removed),
-- and whoever an administrator names. On a server that already has accounts,
-- this migration names the oldest one (approved 2026-11-18): on a team server
-- that is usually whoever installed it, and PHAROS_ADMINS corrects it.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

UPDATE users SET is_admin = true
 WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin);
