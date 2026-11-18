import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { TokenService } from "../auth/tokens";
import { makeRequireAuth } from "../auth/middleware";
import type { AdminService } from "../admin/admin.service";
import { requireSupportedVersion } from "../sync/sync.version";
import { MAX_ROTATION_OVERLAP_HOURS, TokenErrors, type ApiTokenService } from "./apiTokens";
import { API_SCOPES } from "./scopes";

// Managing API tokens (INT-02, ADR-0052 §2.2). Only with a session of the app
// or the web: a token never manages tokens (no escalation). Who may do what
// is checked in the service: `token.manage` for a workspace's project tokens,
// the owner for a personal token, the server administrator for revoking any.

const scopes = z.array(z.enum(API_SCOPES)).min(1).max(API_SCOPES.length);
const name = z.string().trim().min(1).max(120);
const expiresAt = z.iso.datetime({ offset: true });
const projectTokenSchema = z.object({ name, projectId: z.string().min(1).max(200), scopes, expiresAt });
const personalTokenSchema = z.object({ name, workspaceId: z.uuid().nullable().default(null), scopes, expiresAt });
const rotateSchema = z.object({ overlapHours: z.number().int().min(0).max(MAX_ROTATION_OVERLAP_HOURS).default(0) });

export function apiTokenRoutes(
  app: FastifyInstance,
  deps: { service: ApiTokenService; tokens: TokenService; admin: AdminService },
) {
  const { service, admin } = deps;
  const requireAuth = makeRequireAuth(deps.tokens);
  const preHandler = [requireAuth, requireSupportedVersion];
  const user = (req: FastifyRequest) => req.userId as string;
  const param = (req: FastifyRequest, key: string) => (req.params as Record<string, string>)[key];
  /** A token id that is not a UUID is a token that does not exist. */
  const tokenId = (req: FastifyRequest) => {
    const id = z.uuid().safeParse(param(req, "token"));
    if (!id.success) throw TokenErrors.notFound();
    return id.data;
  };
  async function requireAdmin(req: FastifyRequest): Promise<void> {
    await requireAuth(req);
    await admin.requireAdmin(req.userId as string);
  }

  // Project tokens of a workspace.
  app.get("/workspaces/:id/tokens", { preHandler }, async (req) => ({
    tokens: await service.listWorkspace(user(req), param(req, "id")),
    // The projects a new token may be bound to (the app's dialog).
    projects: await service.workspaceProjects(user(req), param(req, "id")),
  }));
  app.post("/workspaces/:id/tokens", { preHandler }, async (req, reply) =>
    reply.code(201).send(await service.createProject(user(req), param(req, "id"), projectTokenSchema.parse(req.body))),
  );
  app.delete("/workspaces/:id/tokens/:token", { preHandler }, async (req, reply) => {
    await service.revokeProject(user(req), param(req, "id"), tokenId(req));
    return reply.code(204).send();
  });
  app.post("/workspaces/:id/tokens/:token/rotate", { preHandler }, async (req, reply) =>
    reply
      .code(201)
      .send(
        await service.rotateProject(user(req), param(req, "id"), tokenId(req), rotateSchema.parse(req.body ?? {}).overlapHours),
      ),
  );
  app.post("/workspaces/:id/tokens/:token/reassign", { preHandler }, async (req) =>
    service.reassignProject(user(req), param(req, "id"), tokenId(req)),
  );

  // Personal access tokens.
  app.get("/me/tokens", { preHandler }, async (req) => ({ tokens: await service.listMine(user(req)) }));
  app.post("/me/tokens", { preHandler }, async (req, reply) =>
    reply.code(201).send(await service.createPersonal(user(req), personalTokenSchema.parse(req.body))),
  );
  app.delete("/me/tokens/:token", { preHandler }, async (req, reply) => {
    await service.revokeMine(user(req), tokenId(req));
    return reply.code(204).send();
  });

  // The server administrator (SEC-11): sees and revokes, never creates.
  const userParam = z.object({ id: z.uuid() });
  app.get("/admin/users/:id/tokens", { preHandler: requireAdmin }, async (req) => ({
    tokens: await service.listOfUser(userParam.parse(req.params).id),
  }));
  app.post("/admin/users/:id/tokens/revoke", { preHandler: requireAdmin }, async (req) => ({
    revoked: await service.adminRevokeAll(user(req), userParam.parse(req.params).id),
  }));
  app.delete("/admin/tokens/:token", { preHandler: requireAdmin }, async (req, reply) => {
    await service.adminRevoke(user(req), tokenId(req));
    return reply.code(204).send();
  });
}
