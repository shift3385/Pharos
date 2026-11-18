import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { AppError } from "../auth/errors";
import type { TokenService } from "../auth/tokens";
import { makeRequireAuth } from "../auth/middleware";
import { requireSupportedVersion } from "../sync/sync.version";
import { requireRole } from "../workspaces/access";
import { isSha256, sha256Hex, type BlobStore } from "./blobStore";

// Attachment and template contents by hash (SYNC-04b, ADR-0014, ADR-0042 §7).
// Every route names the workspace (`workspace`) and needs the account's
// membership: reading needs `read`; uploading, `attachment.add`. A workspace
// only learns what it holds itself, never what another one does.

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const missingSchema = z.object({
  workspaceId: z.string().uuid(),
  hashes: z.array(hash).max(1000),
});
const scopeSchema = z.object({ workspace: z.string().uuid() });
const mimeOf = (req: FastifyRequest) => {
  const raw = req.headers["x-pharos-blob-mime"];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && /^[\w.+-]+\/[\w.+-]+$/.test(v) ? v : null;
};

export function blobRoutes(
  app: FastifyInstance,
  deps: { pool: Pool; tokens: TokenService; store: BlobStore; maxBytes: number },
) {
  const { pool, store, maxBytes } = deps;
  const preHandler = [makeRequireAuth(deps.tokens), requireSupportedVersion];
  const user = (req: FastifyRequest) => req.userId as string;

  // The upload body is the raw content, in this scope only.
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: maxBytes }, (_req, body, done) =>
    done(null, body),
  );

  /** Which of these contents the workspace does not hold yet. */
  app.post("/blobs/missing", { preHandler }, async (req) => {
    const { workspaceId, hashes } = missingSchema.parse(req.body);
    await requireRole(pool, user(req), workspaceId, "read");
    const { rows } = await pool.query<{ sha256: string }>(
      "SELECT sha256 FROM blobs WHERE workspace_id = $1 AND sha256 = ANY($2::text[])",
      [workspaceId, [...new Set(hashes)]],
    );
    const held = new Set(rows.map((r) => r.sha256));
    return { missing: [...new Set(hashes)].filter((h) => !held.has(h)) };
  });

  /** Uploads one content; the server checks its hash. The same content
   *  again is a no-op. */
  app.put("/blobs/:sha256", { preHandler, bodyLimit: maxBytes }, async (req, reply) => {
    const sha = (req.params as { sha256: string }).sha256;
    if (!isSha256(sha)) throw new AppError(400, "bad_hash", "Not a sha256.");
    const { workspace } = scopeSchema.parse(req.query);
    await requireRole(pool, user(req), workspace, "attachment.add");
    const body = req.body;
    if (!Buffer.isBuffer(body)) {
      throw new AppError(415, "unsupported_media_type", "Send the content as application/octet-stream.");
    }
    if (sha256Hex(body) !== sha) {
      throw new AppError(400, "hash_mismatch", "The content does not match its sha256.");
    }
    const key = await store.put(sha, body);
    await pool.query(
      `INSERT INTO blobs (workspace_id, sha256, size, mime, storage_key, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id, sha256) DO NOTHING`,
      [workspace, sha, body.length, mimeOf(req), key, user(req)],
    );
    return reply.code(204).send();
  });

  /** Downloads one content of the workspace. */
  app.get("/blobs/:sha256", { preHandler }, async (req, reply) => {
    const sha = (req.params as { sha256: string }).sha256;
    if (!isSha256(sha)) throw new AppError(400, "bad_hash", "Not a sha256.");
    const { workspace } = scopeSchema.parse(req.query);
    await requireRole(pool, user(req), workspace, "read");
    const { rows } = await pool.query<{ storage_key: string; mime: string | null }>(
      "SELECT storage_key, mime FROM blobs WHERE workspace_id = $1 AND sha256 = $2",
      [workspace, sha],
    );
    const opened = rows[0] ? await store.open(rows[0].storage_key) : null;
    if (!opened) throw new AppError(404, "blob_not_found", "This content is not on the server.");
    return reply
      .header("content-type", "application/octet-stream")
      .header("content-length", String(opened.size))
      .header("x-pharos-blob-mime", rows[0].mime ?? "")
      .send(opened.stream);
  });
}
