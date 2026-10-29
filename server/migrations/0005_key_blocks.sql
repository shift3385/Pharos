-- Key blocks (DAT-01, ADR-0010 rule 4). Each device numbers cases,
-- requirements and defects from a block of numbers it leased here, so two
-- devices working offline never hand out the same key. One row per project
-- and kind holds the next number never handed out; a lease takes the next
-- block with one UPDATE … RETURNING under the row lock, so two requests (of any
-- user) can never get the same range. `owner_id` is the account the project
-- belongs to: only it can lease blocks of that project (until workspaces,
-- TEN-01, make the row belong to the shared project).

CREATE TABLE IF NOT EXISTS key_blocks (
    project_id text NOT NULL,
    kind       text NOT NULL CHECK (kind IN ('case', 'requirement', 'defect')),
    owner_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    next_value bigint NOT NULL CHECK (next_value > 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, kind)
);
