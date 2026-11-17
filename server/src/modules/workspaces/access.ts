import type { FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { AppError } from "../auth/errors";
import { membership, memberships, personalOf, wasMember, type Membership, type Queryable } from "./members";
import { can, type Capability } from "./roles";

declare module "fastify" {
  interface FastifyRequest {
    /** The workspace a request acts on and the user's role there, set by
     *  `requireCapability` (SYNC-07). */
    workspace?: Membership;
  }
}

export const WorkspaceErrors = {
  /** The user was removed from the workspace, or it was deleted: the device
   *  warns and drops its copy (ADR-0019 decision 2, ADR-0042 §6). */
  revoked: (workspaceId: string) =>
    new AppError(403, "workspace_revoked", "You are no longer a member of this workspace.", { workspaceId }),
  /** Never a member: the same answer as a workspace that does not exist. */
  notFound: () => new AppError(404, "workspace_not_found", "Workspace not found."),
  forbidden: (capability: Capability) =>
    new AppError(403, "forbidden", "Your role in this workspace does not allow this.", { capability }),
  required: () => new AppError(400, "workspace_required", "Name the workspace of this request (workspaceId)."),
};

/** The user's active membership of `workspaceId`, or the error that says
 *  why there is none: `workspace_revoked` for a former member (or a deleted
 *  workspace), `workspace_not_found` for anyone else. */
export async function requireMembership(q: Queryable, userId: string, workspaceId: string): Promise<Membership> {
  const m = await membership(q, userId, workspaceId);
  if (m) return m;
  throw (await wasMember(q, userId, workspaceId)) ? WorkspaceErrors.revoked(workspaceId) : WorkspaceErrors.notFound();
}

/** The same, plus the role must have `cap`. */
export async function requireRole(
  q: Queryable,
  userId: string,
  workspaceId: string,
  cap: Capability,
): Promise<Membership> {
  const m = await requireMembership(q, userId, workspaceId);
  if (!can(m.role, cap)) throw WorkspaceErrors.forbidden(cap);
  return m;
}

/** The workspace of a sync request (ADR-0042 §2): the one a client with
 *  `workspaces` names (`requested`), or else the user's personal workspace,
 *  where they are Test Manager (a client without the feature, a
 *  development build of this minor, or a request that names none). */
export async function syncWorkspace(
  q: Queryable,
  userId: string,
  knowsWorkspaces: boolean,
  requested: string | undefined,
): Promise<Membership> {
  const id = knowsWorkspaces && requested ? requested : await personalOf(q, userId);
  return requireMembership(q, userId, id);
}

/** Every active membership of the user (a pull without a workspace). */
export const userMemberships = memberships;

/** Where a route reads the workspace id from. `project`: the `projectId` of
 *  the query or body; the workspace is the one whose live project it is
 *  among the user's own. */
export type WorkspaceSource = "param" | "query" | "body" | "project";

function pick(req: FastifyRequest, from: Exclude<WorkspaceSource, "project">, key: string): string | undefined {
  const bag = (from === "param" ? req.params : from === "query" ? req.query : req.body) as
    | Record<string, unknown>
    | undefined;
  const v = bag?.[key];
  return typeof v === "string" ? v : undefined;
}

/** The workspace where the user's live project `projectId` is, or null. */
export async function workspaceOfProject(q: Queryable, userId: string, projectId: string): Promise<string | null> {
  const { rows } = await q.query<{ workspace_id: string }>(
    `SELECT d.workspace_id FROM documents d
       JOIN workspace_members m ON m.workspace_id = d.workspace_id AND m.user_id = $2 AND m.removed_at IS NULL
       JOIN workspaces w ON w.id = d.workspace_id AND w.deleted_at IS NULL
      WHERE d.entity = 'project' AND d.entity_id = $1 AND NOT d.deleted
      LIMIT 1`,
    [projectId, userId],
  );
  return rows[0]?.workspace_id ?? null;
}

/** preHandler factory for routes of other tracks (C: SEC-09, K: CAS-02,
 *  ADR-0042 §8): resolves the workspace of the request, checks the user is
 *  an active member whose role has `cap`, and leaves `req.workspace =
 *  { workspaceId, role, kind, name }`. Answers 400 `workspace_required`,
 *  403 `workspace_revoked`, 404 `workspace_not_found` or 403 `forbidden`
 *  (with `capability`). Put it after the auth preHandler. */
export function requireCapability(
  pool: Pool,
  cap: Capability,
  opts: { from: WorkspaceSource; key?: string } = { from: "param" },
) {
  return async function checkCapability(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const userId = req.userId as string;
    let workspaceId: string | undefined;
    if (opts.from === "project") {
      const projectId = pick(req, "query", opts.key ?? "projectId") ?? pick(req, "body", opts.key ?? "projectId");
      if (!projectId) throw WorkspaceErrors.required();
      workspaceId = (await workspaceOfProject(pool, userId, projectId)) ?? undefined;
      if (!workspaceId) throw new AppError(404, "not_found", "Project not found.");
    } else {
      workspaceId = pick(req, opts.from, opts.key ?? (opts.from === "param" ? "id" : "workspaceId"));
    }
    if (!workspaceId) throw WorkspaceErrors.required();
    req.workspace = await requireRole(pool, userId, workspaceId, cap);
  };
}
