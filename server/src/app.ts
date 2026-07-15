import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import type { Pool } from "pg";
import type { Env } from "./config/env";
import { createTokenService } from "./modules/auth/tokens";
import { createAuthRepository } from "./modules/auth/auth.repository";
import { createAuthService } from "./modules/auth/auth.service";
import { authRoutes } from "./modules/auth/auth.routes";
import { AppError } from "./modules/auth/errors";

/** Builds the Fastify application wired to the given pool + config. */
export function buildApp(deps: { pool: Pool; env: Env }) {
  const { pool, env } = deps;
  const app = Fastify({ logger: env.NODE_ENV !== "test" });

  void app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
  });

  const tokens = createTokenService({
    accessSecret: env.JWT_ACCESS_SECRET,
    accessTtl: env.ACCESS_TOKEN_TTL,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  });
  const repo = createAuthRepository(pool);
  const service = createAuthService({ repo, tokens });

  app.get("/health", async () => ({ status: "ok" }));
  void app.register(async (instance) => {
    authRoutes(instance, { service, tokens });
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: "validation_error",
        message: "Invalid input.",
        issues: error.issues,
      });
    }
    if (error instanceof AppError) {
      return reply
        .code(error.statusCode)
        .send({ code: error.code, message: error.message });
    }
    req.log.error(error);
    return reply
      .code(500)
      .send({ code: "internal_error", message: "Internal server error." });
  });

  return app;
}
