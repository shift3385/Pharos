-- Suite baselines (CAS-02, ADR-0047): a named, frozen set of cases of one
-- project, each at the exact revision it had when the baseline was made.
-- A baseline never changes and is never deleted (ISTQB: a baseline changes
-- only through a new one). Each item points at the immutable revision row
-- (`test_case_revisions.id`, UUIDv5 of its content, DAT-02), which already
-- syncs, so any device can read the frozen content. `revision`, `status`,
-- `scenario_id` and `title` are copies for the list, taken from that row.
--
-- The review flow of a case (draft → reviewed → approved) needs no schema
-- change: who sent and who approved live in `test_cases.data`
-- (`data.review`, `data.approval`), like the plan's approval (ADR-0040).

CREATE TABLE case_baselines (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT,
    project_id    TEXT NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    scope_label   TEXT NOT NULL DEFAULT '',
    approved_only INTEGER NOT NULL DEFAULT 0 CHECK (approved_only IN (0, 1)),
    created_by    TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    hlc           TEXT NOT NULL DEFAULT ''
);

CREATE INDEX case_baselines_project_idx ON case_baselines (project_id);

CREATE TABLE case_baseline_items (
    baseline_id  TEXT NOT NULL,
    case_id      TEXT NOT NULL,
    revision_id  TEXT NOT NULL,
    revision     INTEGER NOT NULL,
    scenario_id  TEXT NOT NULL,
    title        TEXT NOT NULL,
    status       TEXT NOT NULL,
    PRIMARY KEY (baseline_id, case_id)
);

-- Frozen: the content of a baseline never changes. Deleting stays possible
-- only for the purge of its project (SYNC-06).
CREATE TRIGGER case_baselines_immutable
BEFORE UPDATE OF project_id, name, description, scope_label, approved_only, created_by
ON case_baselines
BEGIN
    SELECT RAISE(ABORT, 'case_baselines: a baseline never changes');
END;

CREATE TRIGGER case_baseline_items_immutable
BEFORE UPDATE ON case_baseline_items
BEGIN
    SELECT RAISE(ABORT, 'case_baseline_items: a baseline never changes');
END;
