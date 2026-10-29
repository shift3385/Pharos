-- DAT-01 local part (ADR-0010). Case, requirement and defect keys travel as
-- Gherkin tags, so they must never be reused.
--
-- key_counters: next number per project and kind ('case' | 'requirement' |
-- 'defect'). It only moves forward, so deleting or purging rows never brings a
-- key back. Rows are created on first use, seeded from the highest key the
-- project ever used. `block_end` is the last number of a block leased from the
-- server (ADR-0010 rule 4, phase 2); NULL = no block yet.
--
-- Unique indexes on live case and defect keys are deferred to phase 2, together
-- with the sync handling of a pulled key that collides with a local one
-- (decision of 2026-10-28): added now, such a pull would fail outright.

CREATE TABLE IF NOT EXISTS key_counters (
    project_id TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('case', 'requirement', 'defect')),
    next_value INTEGER NOT NULL,
    block_end  INTEGER,
    PRIMARY KEY (project_id, kind)
);
