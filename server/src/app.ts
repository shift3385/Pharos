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
import { createAccountService } from "./modules/auth/account.service";
import { mailerFromEnv, type Mailer } from "./modules/auth/mailer";
import { authRoutes } from "./modules/auth/auth.routes";
import { createSyncRepository } from "./modules/sync/sync.repository";
import { syncRoutes } from "./modules/sync/sync.routes";
import { createServerClock } from "./modules/sync/sync.hlc";
import { createDomainStore } from "./modules/domain/domain.store";
import { createDomainService } from "./modules/domain/domain.service";
import { domainRoutes } from "./modules/domain/domain.routes";
import { createCycleService, cycleRoutes } from "./modules/domain/cycles";
import { createRunService, runRoutes } from "./modules/domain/runs";
import { createExecutionService, executionRoutes } from "./modules/domain/execution";
import { homeMetricsRoutes } from "./modules/domain/home-metrics";
import { createPreferenceStore, preferenceRoutes } from "./modules/preferences/preferences";
import { auditRoutes, createAuditReader } from "./modules/audit/audit.read";
import {
  createNotificationStore,
  notificationRoutes,
  notificationWorkspaceHooks,
  workspaceMembership,
} from "./modules/notifications";
import { isMember, listMembers } from "./modules/workspaces/members";
import { workspaceApproverCheck } from "./modules/workspaces/approval";
import { setApproverCheck } from "./modules/domain/case-review";
import { httpsOnly } from "./modules/security/httpsOnly";
import { SERVER_VERSION, acceptedMinors } from "./modules/sync/sync.version";
import { AppError } from "./modules/auth/errors";
import { createWorkspaceService } from "./modules/workspaces/workspaces.service";
import { workspaceRoutes } from "./modules/workspaces/workspaces.routes";
import { aiRoutes, createAiVaultStore, type Fetch } from "./modules/ai";

/** Routes limited per client IP: guessing passwords on login, and burning
 *  Argon2 CPU on register; guessing passwords, recovery codes or reset links,
 *  and sending reset emails (SEC-08/09). Only their POSTs: reading the
 *  recovery code status is not limited. */
const RATE_LIMITED_ROUTES = [
  "/auth/login",
  "/auth/register",
  "/auth/password",
  "/auth/recovery-codes",
  "/auth/recover",
  "/auth/reset/request",
  "/auth/reset/check",
  "/auth/reset/confirm",
];

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
export function buildApp(deps: {
  pool: Pool;
  env: Env;
  mailer?: Mailer | null;
  /** The AI providers' fetch (IA-12); tests pass a fake one. */
  aiFetch?: Fetch;
  /** Where logs go instead of stdout (tests read it). */
  logStream?: { write(line: string): void };
}) {
  const { pool, env } = deps;
  const app = Fastify({
    // Tests may pass a stream to read what would be logged (IA-12: no key in logs).
    logger: deps.logStream ? { level: "trace", stream: deps.logStream } : env.NODE_ENV !== "test",
    bodyLimit: env.BODY_LIMIT_BYTES,
    trustProxy: env.TRUST_PROXY,
  });

  // SEC-07: only https in production (from the reverse proxy), before anything else.
  app.addHook("onRequest", httpsOnly(env));

  void app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : parseOrigins(env.CORS_ORIGIN),
  });

  // Per-route limits (BASE-06), kept here so route modules stay unaware of
  // them. This hook must be added before the rate-limit plugin loads: the
  // plugin reads `config.rateLimit` from its own onRoute hook.
  app.addHook("onRoute", (route) => {
    const methods = [route.method].flat();
    if (RATE_LIMITED_ROUTES.includes(route.url) && methods.includes("POST")) {
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
  // One server clock for every web write and audit event.
  const clock = createServerClock();
  const account = createAccountService({
    pool,
    repo,
    clock,
    issueSession: service.issueSession,
    mailer: deps.mailer === undefined ? mailerFromEnv(env) : deps.mailer,
    publicUrl: env.APP_PUBLIC_URL,
    resetTtlMs: env.RESET_TOKEN_TTL,
    log: app.log,
  });

  const syncRepo = createSyncRepository(pool);
  const domainStore = createDomainStore(pool, clock);
  // Notifications go between members of the event's workspace (RED-W2),
  // and the workspaces' own events (invitation, join, removal) become
  // notifications inside their transaction (ADR-0042 §8, ADR-0048).
  const membership = workspaceMembership(pool, { isMember, listMembers });
  const workspaces = createWorkspaceService(pool, clock, notificationWorkspaceHooks(membership));
  // Who approves a case (CAS-02): Test Manager or Test Analyst of the
  // workspace, never the author (ADR-0042 §8, decision of 2026-11-17).
  setApproverCheck(workspaceApproverCheck(pool));
  const domain = createDomainService(domainStore);
  const cycles = createCycleService(domainStore);
  const runs = createRunService(domainStore);
  const execution = createExecutionService(domainStore);

  // The app checks a server with this before signing in to it (SEC-10): it
  // must say it is Pharos, and the version tells an incompatible one apart.
  app.get("/health", async () => ({
    status: "ok",
    service: "pharos",
    version: SERVER_VERSION,
    accepted: acceptedMinors(),
  }));
  void app.register(async (instance) => {
    authRoutes(instance, { service, tokens, account });
  });
  void app.register(async (instance) => {
    syncRoutes(instance, { repo: syncRepo, tokens, pool });
  });
  void app.register(async (instance) => {
    workspaceRoutes(instance, { service: workspaces, tokens });
  });
  void app.register(async (instance) => {
    domainRoutes(instance, { domain, tokens });
  });
  void app.register(async (instance) => {
    cycleRoutes(instance, { cycles, tokens });
  });
  void app.register(async (instance) => {
    runRoutes(instance, { runs, tokens });
    executionRoutes(instance, { execution, tokens });
  });
  void app.register(async (instance) => {
    homeMetricsRoutes(instance, { tokens, core: execution.homeMetrics });
  });
  void app.register(async (instance) => {
    preferenceRoutes(instance, { tokens, store: createPreferenceStore(pool) });
  });
  void app.register(async (instance) => {
    // Who may notify whom comes from the workspaces (W); until then, nobody else.
    notificationRoutes(instance, { tokens, store: createNotificationStore(pool, membership) });
  });
  void app.register(async (instance) => {
    auditRoutes(instance, { tokens, reader: createAuditReader(pool) });
  });
  void app.register(async (instance) => {
    // IA-12 (ADR-0034): its own error handler, in this scope only.
    aiRoutes(instance, { tokens, env, store: createAiVaultStore(pool), fetch: deps.aiFetch });
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
