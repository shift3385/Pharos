-- Workspaces with roles on the desktop (SYNC-07, ADR-0042 §6). Additive.
--
-- Until now each installation had one "My workspace" with a random id, and
-- visibility was the project's owner. From here a workspace is what the
-- server says: `local` (the device's own, never published), `personal` (the
-- account's, one per account) or `shared`. Who belongs to a synced workspace
-- and with which role is a read-only mirror of `GET /workspaces`, per
-- account of this device; the server is the authority (it checks every
-- delta). The first sync with a server that has `workspaces` moves each
-- account's rows from the local workspace to its personal one (`workspaces.rs`).

ALTER TABLE workspaces ADD COLUMN kind TEXT NOT NULL DEFAULT 'local'
    CHECK (kind IN ('local', 'personal', 'shared'));
-- «Aprobación independiente» (PLN-08, ADR-0049): a mirror of the server's
-- value; never on in a local or personal workspace.
ALTER TABLE workspaces ADD COLUMN independent_approval INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    role         TEXT NOT NULL CHECK (role IN ('test_manager', 'test_analyst', 'automation_engineer', 'product_owner', 'viewer')),
    email        TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    first_name   TEXT NOT NULL DEFAULT '',
    last_name    TEXT NOT NULL DEFAULT '',
    added_at     TEXT,
    PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user ON workspace_members (user_id);

-- The workspace a pending change belongs to, stamped when it is written: a
-- delete leaves no row to read it from, and a push goes to one workspace.
ALTER TABLE oplog ADD COLUMN workspace_id TEXT;

-- «Sin acceso en el servidor» (ADR-0042 §6, decision 5 of 2026-11-17): a
-- project the server knew that no workspace of the account sends any more.
-- Read only here; it can be exported or deleted, and never pushes.
ALTER TABLE projects ADD COLUMN access_lost_at TEXT;

-- Deltas the server refused without writing (ADR-0042 §2): the role does not
-- allow them (`forbidden`) or the entity lives in a workspace the account
-- left (`not_found`). They wait for the user in the conflict panel, who
-- discards them; the change never reaches the server.
CREATE TABLE IF NOT EXISTS sync_rejections (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    workspace_id TEXT,
    entity       TEXT NOT NULL,
    entity_id    TEXT NOT NULL,
    reason       TEXT NOT NULL CHECK (reason IN ('forbidden', 'not_found')),
    detected_at  TEXT NOT NULL,
    resolved_at  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS sync_rejections_open
    ON sync_rejections (user_id, entity, entity_id) WHERE resolved_at IS NULL;

-- Who created a project or a planner card on the server (its `ownerId`). On
-- this device `owner_id` says which account holds the row (FIX-07): for a
-- synced workspace, the member that pulled it, so the account-scoped reads
-- and guards keep working for every member. The payload sends the creator
-- back unchanged (`sync.rs`).
ALTER TABLE projects ADD COLUMN creator_id TEXT;
ALTER TABLE planner_cards ADD COLUMN creator_id TEXT;
UPDATE projects SET creator_id = owner_id WHERE creator_id IS NULL;
UPDATE planner_cards SET creator_id = owner_id WHERE creator_id IS NULL;

-- A row under a project lives in the project's workspace, whatever the code
-- that inserted it stamped (most stamp the device's local workspace): a case
-- of a shared project is in the shared workspace. Only the location changes,
-- which every append-only table allows. Suite baselines (0042, after this
-- one) are stamped with their project's workspace by `case_baseline.rs`.
CREATE TRIGGER IF NOT EXISTS test_plans_project_workspace
AFTER INSERT ON test_plans
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE test_plans SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS test_cases_project_workspace
AFTER INSERT ON test_cases
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE test_cases SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS test_case_revisions_project_workspace
AFTER INSERT ON test_case_revisions
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE test_case_revisions SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS requirements_project_workspace
AFTER INSERT ON requirements
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE requirements SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS planner_cards_project_workspace
AFTER INSERT ON planner_cards
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE planner_cards SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS custom_fields_project_workspace
AFTER INSERT ON custom_fields
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE custom_fields SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS configurations_project_workspace
AFTER INSERT ON configurations
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE configurations SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS test_cycles_project_workspace
AFTER INSERT ON test_cycles
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE test_cycles SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS test_cycle_items_project_workspace
AFTER INSERT ON test_cycle_items
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE test_cycle_items SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS runs_project_workspace
AFTER INSERT ON runs
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE runs SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS run_items_project_workspace
AFTER INSERT ON run_items
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE run_items SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS unlinked_mappings_project_workspace
AFTER INSERT ON unlinked_mappings
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE unlinked_mappings SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS run_shards_project_workspace
AFTER INSERT ON run_shards
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE run_shards SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS results_project_workspace
AFTER INSERT ON results
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE results SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS defects_project_workspace
AFTER INSERT ON defects
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE defects SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS defect_links_project_workspace
AFTER INSERT ON defect_links
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE defect_links SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS attachments_project_workspace
AFTER INSERT ON attachments
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE attachments SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS audit_log_project_workspace
AFTER INSERT ON audit_log
WHEN NEW.project_id IS NOT NULL
 AND NEW.workspace_id IS NOT (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
 AND EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id)
BEGIN
    UPDATE audit_log SET workspace_id = (SELECT workspace_id FROM projects WHERE id = NEW.project_id)
     WHERE rowid = NEW.rowid;
END;

-- The location of an audit event (`workspace_id`) is outside its hash
-- (ADR-0015) and may move, as on the server (`LOCATION_KEYS`): moving a
-- project, or the first sync putting the device's rows in the account's
-- personal workspace. Everything else stays append-only but the redaction.
DROP TRIGGER IF EXISTS audit_log_only_redaction;
CREATE TRIGGER audit_log_only_redaction
BEFORE UPDATE ON audit_log
WHEN NOT (
        NEW.id IS OLD.id AND NEW.project_id IS OLD.project_id
    AND NEW.at IS OLD.at AND NEW.hlc IS OLD.hlc AND NEW.device_id IS OLD.device_id
    AND NEW.actor IS OLD.actor AND NEW.on_behalf_of IS OLD.on_behalf_of AND NEW.action IS OLD.action
    AND NEW.entity IS OLD.entity AND NEW.entity_id IS OLD.entity_id AND NEW.entity_key IS OLD.entity_key
    AND NEW.changes_sha256 IS OLD.changes_sha256 AND NEW.summary IS OLD.summary AND NEW.origin IS OLD.origin
    AND NEW.chain_workspace_id IS OLD.chain_workspace_id AND NEW.chain_owner IS OLD.chain_owner
    AND NEW.chain_seq IS OLD.chain_seq AND NEW.prev_hash IS OLD.prev_hash AND NEW.hash IS OLD.hash
    AND NEW.user_id IS OLD.user_id
    AND (
            -- a redaction, in place
            (NEW.workspace_id IS OLD.workspace_id
             AND OLD.changes IS NOT NULL AND NEW.changes IS NULL
             AND OLD.redacted_at IS NULL AND NEW.redacted_at IS NOT NULL)
            -- or a move: only the workspace changes
         OR (NEW.workspace_id IS NOT OLD.workspace_id
             AND NEW.changes IS OLD.changes AND NEW.redacted_at IS OLD.redacted_at)
    )
)
BEGIN
    SELECT RAISE(ABORT, 'audit_log is append-only: only its location may move, or its changes be redacted');
END;
