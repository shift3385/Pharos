// Read-only /api/v1 lists of cases, cycles, defects and requirements (INT-02,
// ADR-0052 «A4»). Each list is incremental: a cursor over the documents'
// global `seq` (the sync's pull cursor), oldest change first, deletions
// included as `deleted: true`, so a CI job or a mirror copies only what
// changed. Reads are not audited; the token's `last_used_at` records them.
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { AppError } from "../auth/errors.js";
import { KEY_SQL } from "../sync/sync.repository.js";
import type { ApiPrincipal, ApiTokenService } from "./apiTokens.js";
import type { ApiScope } from "./scopes.js";
import type { CycleService } from "../domain/cycles.js";
import { API_V1, resolveProject } from "./v1.js";
import { caseListSchema, caseSchema, cycleSchema, readItemSchema, readListSchema, readQuerySchema } from "./v1.schemas.js";

/** The resources of A4: path, document entity and scope. */
export const READ_RESOURCES = [
  { path: "cases", entity: "test_case", scope: "cases:read", noun: "Case" },
  { path: "cycles", entity: "test_cycle", scope: "cycles:read", noun: "Cycle" },
  { path: "defects", entity: "defect", scope: "defects:read", noun: "Defect" },
  { path: "requirements", entity: "requirement", scope: "requirements:read", noun: "Requirement" },
] as const satisfies readonly { path: string; entity: string; scope: ApiScope; noun: string }[];

interface Row {
  entity_id: string;
  key: string | null;
  payload: Record<string, unknown>;
  deleted: boolean;
  updated_at: Date;
  seq: string;
}

const item = (r: Row) => ({
  id: r.entity_id,
  key: r.key,
  updatedAt: r.updated_at.toISOString(),
  deleted: r.deleted,
  data: r.deleted ? null : r.payload,
});

export function apiV1ReadRoutes(
  app: FastifyInstance,
  deps: {
    pool: Pool;
    service: ApiTokenService;
    cycles: CycleService;
    preHandler: (req: FastifyRequest) => Promise<void>;
    config: Record<string, unknown>;
  },
) {
  const { pool, service, preHandler, config } = deps;
  const principal = (req: FastifyRequest) => req.api as ApiPrincipal;
  const params = (req: FastifyRequest) => req.params as { projectId: string; key?: string };

  /** The cycle's progress summary, as the web computes it. */
  async function progress(ownerId: string, row: Row) {
    if (row.deleted) return null;
    const out = await deps.cycles.cycles.progress(ownerId, row.entity_id);
    return out?.summary ?? null;
  }

  for (const res of READ_RESOURCES) {
    app.get(`${API_V1}/projects/:projectId/${res.path}`, { preHandler, config }, async (req) => {
      const p = principal(req);
      const q = readQuerySchema.parse(req.query ?? {});
      const project = await resolveProject(pool, service, p, params(req).projectId, res.scope);
      const { rows } = await pool.query<Row>(
        `SELECT entity_id, ${KEY_SQL} AS key, payload, deleted, updated_at, seq::text AS seq
           FROM documents
          WHERE workspace_id = $1 AND entity = $2 AND payload->>'projectId' = $3
            AND seq > $4::bigint
            AND ($5::boolean OR NOT deleted)
            AND ($6::text IS NULL OR payload->>'status' = $6)
          ORDER BY seq
          LIMIT $7`,
        [project.workspace.id, res.entity, project.id, q.updatedSince ?? "0", q.includeDeleted, q.status ?? null, q.limit + 1],
      );
      const page = rows.slice(0, q.limit);
      const items = page.map(item);
      const body = {
        items,
        nextCursor: page.length > 0 ? page[page.length - 1].seq : (q.updatedSince ?? "0"),
        hasMore: rows.length > q.limit,
      };
      return res.path === "cases" ? caseListSchema.parse(body) : readListSchema.parse(body);
    });

    app.get(`${API_V1}/projects/:projectId/${res.path}/:key`, { preHandler, config }, async (req) => {
      const p = principal(req);
      const { projectId, key = "" } = params(req);
      const project = await resolveProject(pool, service, p, projectId, res.scope);
      // By key (`TC-001`, `CYC-003`) or by id; a live item wins over a
      // deleted one that once had the key.
      const { rows } = await pool.query<Row>(
        `SELECT entity_id, ${KEY_SQL} AS key, payload, deleted, updated_at, seq::text AS seq
           FROM documents
          WHERE workspace_id = $1 AND entity = $2 AND payload->>'projectId' = $3
            AND (entity_id = $4 OR upper(${KEY_SQL}) = upper($4))
          ORDER BY deleted, seq DESC
          LIMIT 1`,
        [project.workspace.id, res.entity, project.id, key],
      );
      const row = rows[0];
      if (!row) throw new AppError(404, "not_found", `${res.noun} not found: ${key}.`);
      if (res.path === "cycles") return cycleSchema.parse({ ...item(row), progress: await progress(p.ownerId, row) });
      return res.path === "cases" ? caseSchema.parse(item(row)) : readItemSchema.parse(item(row));
    });
  }
}
