import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { TokenService } from "../auth/tokens";
import { makeRequireAuth } from "../auth/middleware";
import { requireSupportedVersion } from "../sync/sync.version";
import { WORKSPACE_ROLES } from "./roles";
import { EXPIRY_DAYS, type WorkspaceService } from "./workspaces.service";

const nameSchema = z.object({ name: z.string().trim().min(1).max(120) });
const roleSchema = z.enum(WORKSPACE_ROLES);
const inviteSchema = z.object({
  role: roleSchema,
  note: z.string().max(200).nullish(),
  expiresInDays: z.union(EXPIRY_DAYS.map((n) => z.literal(n))).default(7),
});
const codeSchema = z.object({ code: z.string().trim().min(8).max(80) });
const memberRoleSchema = z.object({ role: roleSchema });
const moveSchema = z.object({ projectId: z.string().min(1).max(200) });
const policySchema = z.object({ independentApproval: z.boolean() });

/** Workspaces, members and invitations (SYNC-07, ADR-0042 §2). Everything
 *  needs a session and a supported app version; who may do what is checked
 *  in the service (`members.manage` for every change but leaving). */
export function workspaceRoutes(app: FastifyInstance, deps: { service: WorkspaceService; tokens: TokenService }) {
  const { service } = deps;
  const preHandler = [makeRequireAuth(deps.tokens), requireSupportedVersion];
  const user = (req: FastifyRequest) => req.userId as string;
  const param = (req: FastifyRequest, key: string) => (req.params as Record<string, string>)[key];

  app.get("/workspaces", { preHandler }, async (req) => ({ workspaces: await service.list(user(req)) }));
  app.post("/workspaces", { preHandler }, async (req, reply) =>
    reply.code(201).send(await service.create(user(req), nameSchema.parse(req.body).name)),
  );
  app.patch("/workspaces/:id", { preHandler }, (req) =>
    service.rename(user(req), param(req, "id"), nameSchema.parse(req.body).name),
  );
  // «Aprobación independiente» (PLN-08, ADR-0049).
  app.patch("/workspaces/:id/policy", { preHandler }, (req) =>
    service.setIndependentApproval(user(req), param(req, "id"), policySchema.parse(req.body).independentApproval),
  );
  app.delete("/workspaces/:id", { preHandler }, async (req, reply) => {
    await service.remove(user(req), param(req, "id"));
    return reply.code(204).send();
  });

  app.get("/workspaces/:id/invitations", { preHandler }, async (req) => ({
    invitations: await service.invitations(user(req), param(req, "id")),
  }));
  app.post("/workspaces/:id/invitations", { preHandler }, async (req, reply) =>
    reply.code(201).send(await service.invite(user(req), param(req, "id"), inviteSchema.parse(req.body))),
  );
  app.delete("/workspaces/:id/invitations/:invitation", { preHandler }, async (req, reply) => {
    await service.revokeInvitation(user(req), param(req, "id"), param(req, "invitation"));
    return reply.code(204).send();
  });
  app.post("/invitations/preview", { preHandler }, (req) => service.preview(codeSchema.parse(req.body).code));
  app.post("/invitations/accept", { preHandler }, (req) => service.accept(user(req), codeSchema.parse(req.body).code));

  app.patch("/workspaces/:id/members/:user", { preHandler }, async (req) => ({
    members: await service.setRole(user(req), param(req, "id"), param(req, "user"), memberRoleSchema.parse(req.body).role),
  }));
  app.delete("/workspaces/:id/members/:user", { preHandler }, async (req, reply) => {
    await service.removeMember(user(req), param(req, "id"), param(req, "user"));
    return reply.code(204).send();
  });

  app.post("/workspaces/:id/move-project", { preHandler }, (req) =>
    service.moveProject(user(req), param(req, "id"), moveSchema.parse(req.body).projectId),
  );
}
