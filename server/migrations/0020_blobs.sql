-- Attachment and template contents by hash (SYNC-04b, ADR-0014, ADR-0042 §7).
-- Additive and forward-only.
--
-- A row says that a workspace holds a content: who uploaded it and when. The
-- bytes live once per sha256 in the BlobStore (`BLOB_DIR`, `storage_key`),
-- shared by the workspaces that hold them; the API only answers about the
-- workspace of the request, so a workspace never learns what another holds.
-- `attachment` and `template` documents (the metadata) sync as ordinary lww
-- documents; the bytes never go through the oplog.

CREATE TABLE IF NOT EXISTS blobs (
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    sha256       text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    size         bigint NOT NULL CHECK (size >= 0),
    mime         text,
    storage_key  text NOT NULL,
    uploaded_by  uuid REFERENCES users (id) ON DELETE SET NULL,
    uploaded_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, sha256)
);
CREATE INDEX IF NOT EXISTS blobs_sha_idx ON blobs (sha256);
