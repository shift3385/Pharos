import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthService } from "./auth.service";
import type { TokenService } from "./tokens";
import { loginSchema, refreshSchema, registerSchema } from "./auth.schemas";
import { AuthErrors } from "./errors";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    userRole?: string;
  }
}

export function authRoutes(
  app: FastifyInstance,
  deps: { service: AuthService; tokens: TokenService },
) {
  const { service, tokens } = deps;

  async function requireAuth(req: FastifyRequest): Promise<void> {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw AuthErrors.unauthorized();
    try {
      const claims = await tokens.verifyAccessToken(header.slice(7));
      req.userId = claims.sub;
      req.userRole = claims.role;
    } catch {
      throw AuthErrors.unauthorized();
    }
  }

  app.post("/auth/register", async (req, reply) => {
    const session = await service.register(registerSchema.parse(req.body));
    return reply.code(201).send(session);
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
}
