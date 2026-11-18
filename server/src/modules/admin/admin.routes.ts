import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { makeRequireAuth } from "../auth/middleware";
import type { TokenService } from "../auth/tokens";
import type { AccountService } from "../auth/account.service";
import type { AdminService } from "./admin.service";

// Administración › Usuarios (SEC-11, SEC-09 by an administrator; ADR-0045).
// Every route checks the role in the database, on this request.

const listQuery = z.object({
  q: z.string().max(200).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const userParam = z.object({ id: z.uuid() });
const resetBody = z.object({
  delivery: z.enum(["email", "link"]),
  locale: z.enum(["es", "en"]).optional(),
});
const adminBody = z.object({ isAdmin: z.boolean() });

export function adminRoutes(
  app: FastifyInstance,
  deps: { tokens: TokenService; admin: AdminService; account: AccountService },
) {
  const { admin, account } = deps;
  const requireAuth = makeRequireAuth(deps.tokens);
  async function requireAdmin(req: FastifyRequest): Promise<void> {
    await requireAuth(req);
    await admin.requireAdmin(req.userId as string);
  }

  app.get("/admin/users", { preHandler: requireAdmin }, async (req) => {
    const { q, offset, limit } = listQuery.parse(req.query);
    return admin.listUsers({ search: q, offset, limit });
  });

  app.post(
    "/admin/users/:id/password-reset",
    { preHandler: requireAdmin },
    async (req) => {
      const { id } = userParam.parse(req.params);
      const { delivery, locale } = resetBody.parse(req.body);
      return account.issueAdminReset(
        req.userId as string,
        id,
        delivery,
        locale,
      );
    },
  );

  app.put(
    "/admin/users/:id/admin",
    { preHandler: requireAdmin },
    async (req) => {
      const { id } = userParam.parse(req.params);
      const { isAdmin } = adminBody.parse(req.body);
      return admin.setAdmin(req.userId as string, id, isAdmin);
    },
  );
}
