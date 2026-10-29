-- Keys and purge (track A3: SYNC-06, DAT-01; ADR-0010). Forward-only.
--
-- retired_keys (SYNC-06): the key of every case, requirement or defect that the
-- purge removed for good. A purged key still counts as used (ADR-0010 rule 5),
-- so a hand-typed or imported key can never bring it back once its row is gone.

CREATE TABLE IF NOT EXISTS retired_keys (
    project_id TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('case', 'requirement', 'defect')),
    key        TEXT NOT NULL,
    retired_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, kind, key)
);
