-- The project library (CAS-01, ADR-0055): shared steps and datasets.
--
-- `shared_steps` and `datasets` are synced `lww` entities, children of their
-- project. `version` goes up with every change of the canonical content
-- (name + params/columns + steps/rows) and `content_sha256` is the JCS hash
-- of that content. Every version is kept, immutable, in
-- `shared_step_revisions` / `dataset_revisions` (`append_only`; id
-- `UUIDv5(ns, item ‖ version ‖ content_sha256)`), so a case pinned to an old
-- version can always be rebuilt.
--
-- A case refers to them in `test_cases.data` (`sharedRefs`, `datasetRefs`)
-- and keeps a materialized copy of the steps and rows: no column here points
-- at a case. Additive: no existing row changes.

CREATE TABLE shared_steps (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT,
    project_id     TEXT NOT NULL,
    name           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    params         TEXT NOT NULL DEFAULT '[]',
    steps          TEXT NOT NULL DEFAULT '[]',
    status         TEXT NOT NULL DEFAULT 'active',
    version        INTEGER NOT NULL DEFAULT 1,
    content_sha256 TEXT NOT NULL DEFAULT '',
    created_by     TEXT NOT NULL,
    updated_by     TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT,
    revision       INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX shared_steps_project_idx ON shared_steps (project_id);

CREATE TABLE datasets (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT,
    project_id     TEXT NOT NULL,
    name           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    columns        TEXT NOT NULL DEFAULT '[]',
    rows           TEXT NOT NULL DEFAULT '[]',
    status         TEXT NOT NULL DEFAULT 'active',
    version        INTEGER NOT NULL DEFAULT 1,
    content_sha256 TEXT NOT NULL DEFAULT '',
    created_by     TEXT NOT NULL,
    updated_by     TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT,
    revision       INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX datasets_project_idx ON datasets (project_id);

CREATE TABLE shared_step_revisions (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT,
    project_id     TEXT NOT NULL,
    item_id        TEXT NOT NULL,
    version        INTEGER NOT NULL,
    name           TEXT NOT NULL,
    params         TEXT NOT NULL,
    steps          TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    created_by     TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    hlc            TEXT NOT NULL DEFAULT ''
);

CREATE INDEX shared_step_revisions_item_idx ON shared_step_revisions (item_id, version);

CREATE TABLE dataset_revisions (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT,
    project_id     TEXT NOT NULL,
    item_id        TEXT NOT NULL,
    version        INTEGER NOT NULL,
    name           TEXT NOT NULL,
    columns        TEXT NOT NULL,
    rows           TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    created_by     TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    hlc            TEXT NOT NULL DEFAULT ''
);

CREATE INDEX dataset_revisions_item_idx ON dataset_revisions (item_id, version);

-- A version never changes. Moving it to another workspace (ADR-0042) and
-- the purge of its project stay possible.
CREATE TRIGGER shared_step_revisions_immutable
BEFORE UPDATE OF project_id, item_id, version, name, params, steps, content_sha256
ON shared_step_revisions
BEGIN
    SELECT RAISE(ABORT, 'shared_step_revisions: a version never changes');
END;

CREATE TRIGGER dataset_revisions_immutable
BEFORE UPDATE OF project_id, item_id, version, name, columns, rows, content_sha256
ON dataset_revisions
BEGIN
    SELECT RAISE(ABORT, 'dataset_revisions: a version never changes');
END;
