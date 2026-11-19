import type { FastifyInstance } from "fastify";
import type { AuthService } from "./auth.service.js";
import type { TokenService } from "./tokens.js";
import type { AccountService } from "./account.service.js";
import type { AdminService } from "../admin/admin.service.js";
import {
  changePasswordSchema,
  loginSchema,
  profileSchema,
  recoverSchema,
  refreshSchema,
  regenerateCodesSchema,
  registerSchema,
  resetConfirmSchema,
  resetRequestSchema,
  resetTokenSchema,
} from "./auth.schemas.js";
import { makeRequireAuth } from "./middleware.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    userRole?: string;
  }
}

export function authRoutes(
  app: FastifyInstance,
  deps: {
    service: AuthService;
    tokens: TokenService;
    account: AccountService;
    admin: AdminService;
  },
) {
  const { service, tokens, account, admin } = deps;

  const requireAuth = makeRequireAuth(tokens);

  app.post("/auth/register", async (req, reply) => {
    const session = await service.register(registerSchema.parse(req.body));
    // The recovery codes travel once, in this answer (SEC-08, ADR-0045).
    const recoveryCodes = await account.issueInitialCodes(session.user.id);
    // The first account of a server, or one in PHAROS_ADMINS, is a server
    // administrator (SEC-11).
    const isAdmin = await admin.nameOnSignUp(session.user.id, session.user.email);
    return reply
      .code(201)
      .send({ ...session, user: { ...session.user, isAdmin }, recoveryCodes });
  });

  app.post("/auth/login", async (req, reply) => {
    const session = await service.login(loginSchema.parse(req.body));
    return reply.send(session);
  });

  app.post("/auth/refresh", async (req, reply) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    return reply.send(await service.refresh(refreshToken));
  });

  app.post("/auth/logout", async (req, reply) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await service.logout(refreshToken);
    return reply.code(204).send();
  });

  app.get("/auth/me", { preHandler: requireAuth }, async (req) => {
    return service.me(req.userId as string);
  });

  // The web edits its profile here (BASE-10); the desktop keeps its own in
  // the local store.
  app.patch("/auth/me", { preHandler: requireAuth }, async (req) => {
    return service.updateProfile(req.userId as string, profileSchema.parse(req.body));
  });

  // ---- Account recovery (SEC-08, SEC-09 by email; ADR-0045) ----

  app.get("/auth/capabilities", async () => account.capabilities());

  app.post("/auth/password", { preHandler: requireAuth }, async (req) => {
    return account.changePassword(req.userId as string, changePasswordSchema.parse(req.body));
  });

  app.get("/auth/recovery-codes", { preHandler: requireAuth }, async (req) => {
    return account.recoveryStatus(req.userId as string);
  });

  app.post("/auth/recovery-codes", { preHandler: requireAuth }, async (req) => {
    const { currentPassword } = regenerateCodesSchema.parse(req.body);
    return { recoveryCodes: await account.regenerateCodes(req.userId as string, currentPassword) };
  });

  app.post("/auth/recover", async (req) => {
    return account.recover(recoverSchema.parse(req.body));
  });

  app.post("/auth/reset/request", async (req, reply) => {
    const { email, locale } = resetRequestSchema.parse(req.body);
    await account.requestReset(email, locale);
    return reply.code(202).send({ status: "sent_if_registered" });
  });

  app.post("/auth/reset/check", async (req) => {
    return account.checkReset(resetTokenSchema.parse(req.body).token);
  });

  app.post("/auth/reset/confirm", async (req, reply) => {
    const { token, newPassword } = resetConfirmSchema.parse(req.body);
    await account.confirmReset(token, newPassword);
    return reply.code(204).send();
  });
}
