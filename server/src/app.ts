import Fastify, { type FastifyError, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type { Pool } from "pg";
import type { Env } from "./config/env.js";
import { parseOrigins } from "./config/origins.js";
import { createTokenService } from "./modules/auth/tokens.js";
import { createAuthRepository } from "./modules/auth/auth.repository.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { createAccountService } from "./modules/auth/account.service.js";
import { createAdminService, isDisabled } from "./modules/admin/admin.service.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { mailerFromEnv, type Mailer } from "./modules/auth/mailer.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { createSyncRepository } from "./modules/sync/sync.repository.js";
import { syncRoutes } from "./modules/sync/sync.routes.js";
import { createServerClock } from "./modules/sync/sync.hlc.js";
import { createDomainStore } from "./modules/domain/domain.store.js";
import { createDomainService } from "./modules/domain/domain.service.js";
import { domainRoutes } from "./modules/domain/domain.routes.js";
import { createCycleService, cycleRoutes } from "./modules/domain/cycles.js";
import { createRunService, runRoutes } from "./modules/domain/runs.js";
import { createFindingService, findingRoutes } from "./modules/domain/findings.js";
import { createExecutionService, executionRoutes } from "./modules/domain/execution.js";
import { homeMetricsRoutes } from "./modules/domain/home-metrics.js";
import { createPreferenceStore, preferenceRoutes } from "./modules/preferences/preferences.js";
import { auditRoutes, createAuditReader } from "./modules/audit/audit.read.js";
import {
  createNotificationStore,
  notificationRoutes,
  notificationWorkspaceHooks,
  workspaceMembership,
} from "./modules/notifications/index.js";
import { isMember, listMembers } from "./modules/workspaces/members.js";
import { independentApproval, workspaceApproverCheck } from "./modules/workspaces/approval.js";
import { setApproverCheck } from "./modules/domain/case-review.js";
import { httpsOnly } from "./modules/security/httpsOnly.js";
import { SERVER_VERSION, acceptedMinors } from "./modules/sync/sync.version.js";
import { AppError, AuthErrors } from "./modules/auth/errors.js";
import { createWorkspaceService } from "./modules/workspaces/workspaces.service.js";
import { workspaceRoutes } from "./modules/workspaces/workspaces.routes.js";
import { aiRoutes, createAiVaultStore, type Fetch } from "./modules/ai/index.js";
import { blobRoutes } from "./modules/blobs/blobs.routes.js";
import { diskBlobStore } from "./modules/blobs/blobStore.js";
import { createApiTokenService } from "./modules/api/apiTokens.js";
import { apiTokenRoutes } from "./modules/api/apiTokens.routes.js";
import { API_V1, apiV1Routes } from "./modules/api/v1.js";
import { hashToken, parseToken } from "./modules/api/tokenFormat.js";
import { processParser, type ReportParser } from "./modules/api/reportParse.js";
import { createRunImport } from "./modules/api/runImport.js";
import { createVault } from "./modules/ai/vault.js";
import { setDocumentHook } from "./modules/sync/sync.repository.js";
import { createWebhookService } from "./modules/webhooks/webhooks.service.js";
import { webhookRoutes } from "./modules/webhooks/webhooks.routes.js";
import { createDispatcher, type Sender } from "./modules/webhooks/dispatcher.js";

/** Routes limited per client IP: guessing passwords on login, and burning
 *  Argon2 CPU on register; guessing passwords, recovery codes or reset links,
 *  and sending reset emails (SEC-08/09). Only their POSTs: reading the
 *  recovery code status is not limited. */
const RATE_LIMITED_ROUTES = [
  "/auth/login",
  "/auth/register",
  "/admin/users/:id/password-reset",
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

/** A request as the log writes it: Fastify's default fields, with any token
 *  in the query string blanked. `/api/v1` refuses a token in the URL
 *  (`token_in_url`), but the request is logged before that answer
 *  (INT-02, ADR-0052 security review). */
function logRequest(req: FastifyRequest) {
  return {
    method: req.method,
    url: req.url.replace(/([?&](?:access_)?token=)[^&#]*/gi, "$1[redacted]"),
    host: req.host,
    remoteAddress: req.ip,
    remotePort: req.socket?.remotePort,
  };
}

/** Builds the Fastify application wired to the given pool + config. */
export function buildApp(deps: {
  pool: Pool;
  env: Env;
  mailer?: Mailer | null;
  /** The AI providers' fetch (IA-12); tests pass a fake one. */
  aiFetch?: Fetch;
  /** How an uploaded report is read (INT-02 A2): tests pass the in-process
   *  parser; the server reads each one in a child process with a deadline. */
  reportParser?: ReportParser;
  /** How a webhook delivery is sent (INT-03): tests pass a fake one. */
  webhookSender?: Sender;
  /** Where logs go instead of stdout (tests read it). */
  logStream?: { write(line: string): void };
}) {
  const { pool, env } = deps;
  const app = Fastify({
    // Tests may pass a stream to read what would be logged (IA-12: no key in logs).
    logger: deps.logStream
      ? { level: "trace", stream: deps.logStream, serializers: { req: logRequest } }
      : env.NODE_ENV !== "test" && { serializers: { req: logRequest } },
    bodyLimit: env.BODY_LIMIT_BYTES,
    trustProxy: env.TRUST_PROXY,
  });

  // SEC-07: only https in production (from the reverse proxy), before anything else.
  app.addHook("onRequest", httpsOnly(env));

  // The public API (INT-02) is for machines with tokens, never for a page in
  // a browser: no CORS there, except its OpenAPI document.
  const corsOrigin = env.CORS_ORIGIN === "*" ? true : parseOrigins(env.CORS_ORIGIN);
  void app.register(cors, {
    delegator: (req, cb) => {
      const url = req.url ?? "";
      const closed = url.startsWith(`${API_V1}/`) && !url.startsWith(`${API_V1}/openapi.json`);
      cb(null, { origin: closed ? false : corsOrigin });
    },
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
    // SEC-12: one primary-key read per authenticated request, so disabling
    // an account takes effect at once (ADR-0045 B3).
    checkAccount: async (userId) => {
      if (await isDisabled(pool, userId)) throw AuthErrors.accountDisabled();
    },
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
    adminResetTtlMs: env.ADMIN_RESET_TTL,
    log: app.log,
  });
  // The server administrator (SEC-11): PHAROS_ADMINS is applied once the
  // database is reachable, before the first request.
  const admin = createAdminService({ pool, clock, envAdmins: env.PHAROS_ADMINS });
  app.addHook("onReady", async () => {
    const named = await admin.applyEnvAdmins();
    if (named.length > 0) app.log.info({ users: named }, "PHAROS_ADMINS named server administrators");
  });

  const syncRepo = createSyncRepository(pool);
  const domainStore = createDomainStore(pool, clock);
  // SYNC-04b contents by hash; the API keeps uploaded reports there too.
  const blobStore = diskBlobStore(env.BLOB_DIR);
  // Notifications go between members of the event's workspace (RED-W2),
  // and the workspaces' own events (invitation, join, removal) become
  // notifications inside their transaction (ADR-0042 §8, ADR-0048).
  const membership = workspaceMembership(pool, { isMember, listMembers });
  const workspaces = createWorkspaceService(pool, clock, notificationWorkspaceHooks(membership));
  // Who approves a case or a plan (CAS-02, PLN-08): the workspace's
  // «Aprobación independiente» decides (ADR-0049). On, the approval role
  // and never the author; off, whoever may edit it, the author included.
  setApproverCheck(workspaceApproverCheck(pool, { rule: independentApproval }));
  const domain = createDomainService(domainStore);
  const cycles = createCycleService(domainStore);
  const runs = createRunService(domainStore);
  const findings = createFindingService(domainStore);
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
    authRoutes(instance, { service, tokens, account, admin });
  });
  void app.register(async (instance) => {
    adminRoutes(instance, { tokens, admin, account });
  });
  // Outgoing webhooks (INT-03, ADR-0052 §4): the outbox every document write
  // feeds, and the dispatcher that sends it.
  const webhookVault = env.WEBHOOK_SECRETS_KEY ? createVault(env.WEBHOOK_SECRETS_KEY) : null;
  const webhookPolicy = { allowPrivate: env.WEBHOOK_ALLOW_PRIVATE, allowHosts: env.WEBHOOK_ALLOW_HOSTS };
  const webhooks = createWebhookService({ pool, clock, vault: webhookVault, policy: webhookPolicy, publicUrl: env.APP_PUBLIC_URL });
  setDocumentHook(webhooks.outbox);
  const dispatcher = createDispatcher({ pool, vault: webhookVault, policy: webhookPolicy, membership, send: deps.webhookSender });

  app.decorate("webhookDispatcher", dispatcher);
  if (env.WEBHOOK_DISPATCH_INTERVAL_MS > 0) {
    app.addHook("onReady", async () => dispatcher.start(env.WEBHOOK_DISPATCH_INTERVAL_MS, app.log));
  }
  app.addHook("onClose", async () => dispatcher.stop());
  void app.register(async (instance) => {
    webhookRoutes(instance, { service: webhooks, tokens });
  });
  // API tokens and the public API /api/v1 (INT-02, ADR-0052).
  const apiTokens = createApiTokenService(pool, clock);
  void app.register(async (instance) => {
    apiTokenRoutes(instance, { service: apiTokens, tokens, admin });
  });
  void app.register(async (instance) => {
    apiV1Routes(instance, {
      pool,
      service: apiTokens,
      store: domainStore,
      runs,
      runImport: createRunImport({ pool, store: domainStore, runs, blobs: blobStore, publicUrl: env.APP_PUBLIC_URL }),
      parser: deps.reportParser ?? processParser(env.API_PARSE_TIMEOUT_MS),
      limits: {
        bodyBytes: env.API_UPLOAD_LIMIT_BYTES,
        fileBytes: env.API_UPLOAD_MAX_BYTES,
        rateMax: env.API_UPLOAD_RATE_LIMIT_MAX,
        rateWindow: env.API_UPLOAD_RATE_LIMIT_WINDOW,
      },
      rateLimit: {
        max: env.API_RATE_LIMIT_MAX,
        timeWindow: env.API_RATE_LIMIT_WINDOW,
        // One bucket per token; a request without a well-formed token, per IP.
        keyGenerator: (req) => {
          const raw = req.headers.authorization?.slice(7).trim() ?? "";
          return parseToken(raw) ? `token:${hashToken(raw)}` : `ip:${req.ip}`;
        },
      },
    });
  });
  void app.register(async (instance) => {
    syncRoutes(instance, { repo: syncRepo, tokens, pool });
  });
  void app.register(async (instance) => {
    workspaceRoutes(instance, { service: workspaces, tokens });
  });
  void app.register(async (instance) => {
    // SYNC-04b: attachment and template contents by hash, outside the oplog.
    blobRoutes(instance, { pool, tokens, store: blobStore, maxBytes: env.BLOB_MAX_BYTES });
  });
  void app.register(async (instance) => {
    domainRoutes(instance, { domain, tokens });
  });
  void app.register(async (instance) => {
    cycleRoutes(instance, { cycles, tokens });
  });
  void app.register(async (instance) => {
    runRoutes(instance, { runs, tokens });
    findingRoutes(instance, { findings, tokens });
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
