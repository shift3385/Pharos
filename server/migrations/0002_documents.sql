-- Sync store (Phase 8, spec §9). One row per (user, entity, entity_id) holding
-- the latest JSON state pushed from a client. `seq` is bumped from a sequence on
-- every insert AND update so clients can pull everything changed since a cursor.
-- Conflict resolution is per-entity last-write-wins by `revision`.

CREATE SEQUENCE IF NOT EXISTS documents_seq;

CREATE TABLE IF NOT EXISTS documents (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    entity     text NOT NULL,
    entity_id  text NOT NULL,
    payload    jsonb NOT NULL,
    revision   integer NOT NULL DEFAULT 1,
    author     text NOT NULL DEFAULT '',
    deleted    boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    seq        bigint NOT NULL DEFAULT nextval('documents_seq'),
    PRIMARY KEY (user_id, entity, entity_id)
);

CREATE INDEX IF NOT EXISTS documents_pull_idx ON documents (user_id, seq);
