-- Traceability (v0.0.2, TRZ-01/02). Requirements are the test basis items of a
-- project (ISTQB CTFL 1.4.4). Each has a stable `requirement_key` (REQ-001…),
-- numbered per project and immutable once created: it travels as a Gherkin tag
-- (@REQ-001) and test cases link to it through `data.requirementKeys`.
-- Planner defect cards gain a visible `card_key` (DEF-001…) for the matrix.

CREATE TABLE IF NOT EXISTS requirements (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL REFERENCES workspaces (id),
    project_id      TEXT NOT NULL,
    requirement_key TEXT NOT NULL,           -- e.g. REQ-001
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    priority        TEXT NOT NULL DEFAULT 'medium', -- low | medium | high
    created_by      TEXT NOT NULL,
    updated_by      TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT,
    revision        INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS requirements_project_idx ON requirements (project_id);

-- A key is unique among the live requirements of a project.
CREATE UNIQUE INDEX IF NOT EXISTS requirements_project_key_idx
    ON requirements (project_id, requirement_key) WHERE deleted_at IS NULL;

ALTER TABLE planner_cards ADD COLUMN card_key TEXT;

-- Backfill: number the existing live defects of each project by creation order.
UPDATE planner_cards
SET card_key = 'DEF-' || printf('%03d', numbered.rn)
FROM (
    SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS rn
    FROM planner_cards
    WHERE kind = 'defect' AND deleted_at IS NULL
) AS numbered
WHERE planner_cards.id = numbered.id;
