import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type { Pool } from "pg";
import type { Env } from "./config/env";
import { parseOrigins } from "./config/origins";
import { createTokenService } from "./modules/auth/tokens";
import { createAuthRepository } from "./modules/auth/auth.repository";
import { createAuthService } from "./modules/auth/auth.service";
import { authRoutes } from "./modules/auth/auth.routes";
import { createSyncRepository } from "./modules/sync/sync.repository";
import { syncRoutes } from "./modules/sync/sync.routes";
import { createServerClock } from "./modules/sync/sync.hlc";
import { createDomainStore } from "./modules/domain/domain.store";
import { createDomainService } from "./modules/domain/domain.service";
import { domainRoutes } from "./modules/domain/domain.routes";
import { AppError } from "./modules/auth/errors";

/** Routes limited per client IP: guessing passwords on login, and burning
 *  Argon2 CPU on register. */
const RATE_LIMITED_ROUTES = ["/auth/login", "/auth/register"];

const CLIENT_ERROR_CODES: Record<number, string> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  413: "payload_too_large",
  415: "unsupported_media_type",
  429: "rate_limited",
};

/** Builds the Fastify application wired to the given pool + config. */
export function buildApp(deps: { pool: Pool; env: Env }) {
  const { pool, env } = deps;
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
    bodyLimit: env.BODY_LIMIT_BYTES,
    trustProxy: env.TRUST_PROXY,
  });

  void app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : parseOrigins(env.CORS_ORIGIN),
  });

  // Per-route limits (BASE-06), kept here so route modules stay unaware of
  // them. This hook must be added before the rate-limit plugin loads: the
  // plugin reads `config.rateLimit` from its own onRoute hook.
  app.addHook("onRoute", (route) => {
    if (RATE_LIMITED_ROUTES.includes(route.url)) {
      route.config = {
        ...route.config,
        rateLimit: {
          max: env.LOGIN_RATE_LIMIT_MAX,
          timeWindow: env.LOGIN_RATE_LIMIT_WINDOW,
        },
      };
    }
    // Sync batches and the web's domain writes carry whole documents.
    if (route.url.startsWith("/sync/") || route.url.startsWith("/api/")) {
      route.bodyLimit ??= env.SYNC_BODY_LIMIT_BYTES;
    }
  });
  void app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_req, ctx) =>
      new AppError(
        429,
        "rate_limited",
        `Too many attempts. Try again in ${ctx.after}.`,
      ),
  });

  const tokens = createTokenService({
    accessSecret: env.JWT_ACCESS_SECRET,
    accessTtl: env.ACCESS_TOKEN_TTL,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  });
  const repo = createAuthRepository(pool);
  const service = createAuthService({ repo, tokens });

  const syncRepo = createSyncRepository(pool);
  const domain = createDomainService(createDomainStore(pool, createServerClock()));

  app.get("/health", async () => ({ status: "ok" }));
  void app.register(async (instance) => {
    authRoutes(instance, { service, tokens });
  });
  void app.register(async (instance) => {
    syncRoutes(instance, { repo: syncRepo, tokens });
  });
  void app.register(async (instance) => {
    domainRoutes(instance, { domain, tokens });
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
        .send({ ...error.details, code: error.code, message: error.message });
    }
    // Fastify's own client errors (body too large, malformed JSON, wrong
    // content type…) keep their 4xx status instead of becoming a 500.
    const { statusCode: status, message } = error as FastifyError;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({
        code: CLIENT_ERROR_CODES[status] ?? "client_error",
        message,
      });
    }
    req.log.error(error);
    return reply
      .code(500)
      .send({ code: "internal_error", message: "Internal server error." });
  });

  return app;
}
