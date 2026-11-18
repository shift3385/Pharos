// The public API /api/v1 (INT-02, ADR-0052 §1-§2). Machines call it with an
// API token: `Authorization: Bearer phr_…`. A session's JWT is not accepted
// here, and these tokens are not accepted anywhere else. Every response
// schema below is also the OpenAPI contract (`openapi.ts`).
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { AppError } from "../auth/errors";
import { memberships } from "../workspaces/members";
import { TokenErrors, type ApiPrincipal, type ApiTokenService } from "./apiTokens";
import type { ApiScope } from "./scopes";
import { meSchema, projectListSchema, projectSchema } from "./v1.schemas";
import { buildOpenApi } from "./openapi";

declare module "fastify" {
  interface FastifyRequest {
    /** Who an /api/v1 request acts as (set by `requireApiToken`). */
    api?: ApiPrincipal;
  }
}

export const API_V1 = "/api/v1";

/** The bearer token of the request. A token in the query string is refused:
 *  URLs end up in logs and proxies. */
function bearer(req: FastifyRequest): string {
  const query = req.query as Record<string, unknown> | undefined;
  if (query && ("token" in query || "access_token" in query)) {
    throw new AppError(400, "token_in_url", "Send the API token in the Authorization header, never in the URL.");
  }
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw TokenErrors.invalid();
  return header.slice(7).trim();
}

export function makeRequireApiToken(service: ApiTokenService) {
  return async function requireApiToken(req: FastifyRequest): Promise<void> {
    req.api = await service.authenticate(bearer(req), req.ip);
  };
}

interface ProjectRow {
  id: string;
  name: string | null;
  case_id_prefix: string | null;
  workspace_id: string;
  workspace_name: string;
}

const toProject = (r: ProjectRow) => ({
  id: r.id,
  name: r.name ?? "",
  caseIdPrefix: r.case_id_prefix ?? "",
  workspace: { id: r.workspace_id, name: r.workspace_name },
});

/** Live projects of the given workspaces. */
async function projectsIn(pool: Pool, workspaceIds: string[], projectId?: string): Promise<ProjectRow[]> {
  if (workspaceIds.length === 0) return [];
  const { rows } = await pool.query<ProjectRow>(
    `SELECT d.entity_id AS id, d.payload->>'name' AS name, d.payload->>'caseIdPrefix' AS case_id_prefix,
            d.workspace_id, w.name AS workspace_name
       FROM documents d JOIN workspaces w ON w.id = d.workspace_id AND w.deleted_at IS NULL
      WHERE d.workspace_id = ANY($1::uuid[]) AND d.entity = 'project' AND NOT d.deleted
        AND ($2::text IS NULL OR d.entity_id = $2)
      ORDER BY lower(d.payload->>'name'), d.entity_id`,
    [workspaceIds, projectId ?? null],
  );
  return rows;
}

/** The workspaces a token reaches: its own, or (a personal token without
 *  one) every workspace where its owner is a member. */
async function reach(pool: Pool, p: ApiPrincipal): Promise<string[]> {
  if (p.workspaceId) return [p.workspaceId];
  return (await memberships(pool, p.ownerId)).map((m) => m.workspaceId);
}

/** The project of a request, within the token's reach and its project (a
 *  project token), with `scope` authorized there. Anything else: 404. */
export async function resolveProject(
  pool: Pool,
  service: ApiTokenService,
  p: ApiPrincipal,
  projectId: string,
  scope: ApiScope,
): Promise<ReturnType<typeof toProject>> {
  if (!p.scopes.includes(scope)) throw TokenErrors.scope(scope);
  if (p.projectId && p.projectId !== projectId) throw TokenErrors.projectScope();
  const [row] = await projectsIn(pool, await reach(pool, p), projectId);
  if (!row) throw TokenErrors.projectScope();
  await service.authorize(p, scope, row.workspace_id);
  return toProject(row);
}

export function apiV1Routes(
  app: FastifyInstance,
  deps: {
    pool: Pool;
    service: ApiTokenService;
    rateLimit: { max: number; timeWindow: number; keyGenerator: (req: FastifyRequest) => string };
  },
) {
  const { pool, service } = deps;
  const requireApiToken = makeRequireApiToken(service);
  const principal = (req: FastifyRequest) => req.api as ApiPrincipal;
  const config = { rateLimit: deps.rateLimit };
  const preHandler = requireApiToken;

  app.get(`${API_V1}/openapi.json`, async () => buildOpenApi());

  app.get(`${API_V1}/me`, { preHandler, config }, async (req) => {
    const p = principal(req);
    const { rows } = await pool.query<{ name: string }>(
      `SELECT coalesce(nullif(display_name, ''), email) AS name FROM users WHERE id = $1`,
      [p.ownerId],
    );
    return meSchema.parse({
      token: {
        id: p.tokenId,
        kind: p.kind,
        name: p.name,
        prefix: p.displayPrefix,
        scopes: p.scopes,
        expiresAt: p.expiresAt,
        workspaceId: p.workspaceId,
        projectId: p.projectId,
      },
      owner: { id: p.ownerId, name: rows[0]?.name ?? "" },
    });
  });

  app.get(`${API_V1}/projects`, { preHandler, config }, async (req) => {
    const p = principal(req);
    if (!p.scopes.includes("projects:read")) throw TokenErrors.scope("projects:read");
    const rows = await projectsIn(pool, await reach(pool, p), p.projectId ?? undefined);
    const visible: ProjectRow[] = [];
    for (const r of rows) {
      try {
        await service.authorize(p, "projects:read", r.workspace_id);
        visible.push(r);
      } catch {
        // Out of the owner's reach today: not listed.
      }
    }
    return projectListSchema.parse({ projects: visible.map(toProject) });
  });

  app.get(`${API_V1}/projects/:projectId`, { preHandler, config }, async (req) => {
    const { projectId } = req.params as { projectId: string };
    return projectSchema.parse(await resolveProject(pool, service, principal(req), projectId, "projects:read"));
  });
}
