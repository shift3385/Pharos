// Runs and results through the public API (INT-02 A2, ADR-0052 §2): upload a
// report, create a run (or find the one of an `externalId`), close it, and
// read runs and their results. Every route needs an API token; the upload
// lives in its own scope, where the body is the report's raw bytes.
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { AppError } from "../auth/errors.js";
import { TokenErrors, type ApiPrincipal, type ApiTokenService } from "./apiTokens.js";
import { statusCounts } from "./importPlan.js";
import { inflate, parseUpload, type ReportParser } from "./reportParse.js";
import { externalRunId, RunErrors, type RunImport } from "./runImport.js";
import type { RunService } from "../domain/runs.js";
import { insertRun } from "../domain/runs.js";
import type { DomainStore } from "../domain/domain.store.js";
import { resolveProject, API_V1 } from "./v1.js";
import {
  resultListSchema,
  runCloseSchema,
  runCreateSchema,
  runListSchema,
  runSchema,
  runSummarySchema,
  uploadQuerySchema,
  uploadResponseSchema,
} from "./v1.schemas.js";

type Json = Record<string, unknown>;

export interface UploadLimits {
  /** Largest body as received (gzip counts compressed). */
  bodyBytes: number;
  /** Largest report once decompressed. */
  fileBytes: number;
  /** Uploads per token and window. */
  rateMax: number;
  rateWindow: number;
}

const RAW_TYPES = [
  "application/xml",
  "text/xml",
  "application/json",
  "application/x-ndjson",
  "application/zip",
  "application/octet-stream",
  "text/plain",
];

export function apiV1RunRoutes(
  app: FastifyInstance,
  deps: {
    pool: Pool;
    service: ApiTokenService;
    store: DomainStore;
    runs: RunService;
    runImport: RunImport;
    parser: ReportParser;
    limits: UploadLimits;
    preHandler: (req: FastifyRequest) => Promise<void>;
    rateLimit: { max: number; timeWindow: number; keyGenerator: (req: FastifyRequest) => string };
  },
) {
  const { pool, service, store, runs, limits, preHandler } = deps;
  const principal = (req: FastifyRequest) => req.api as ApiPrincipal;
  const config = { rateLimit: deps.rateLimit };
  const projectRef = (req: FastifyRequest) => (req.params as { projectId: string }).projectId;

  /** A live run of the project by its key, or 404. */
  async function runOf(userId: string, projectId: string, key: string) {
    const list = (await runs.list(userId, projectId)) as Json[];
    const run = list.find((r) => String(r.runKey).toLowerCase() === key.toLowerCase());
    if (!run) throw RunErrors.notFound(key);
    return run;
  }

  async function summary(userId: string, run: Json) {
    const views = await runs.results(userId, String(run.id));
    const finals = views.filter((v) => v.isFinal);
    const linked = views.filter((v) => v.effectiveTestCaseId).length;
    const byStatus = statusCounts(
      finals.map((v) => ({ testKey: v.testKey, configurationLabel: v.configurationLabel, attempt: v.attempt, status: v.status })) as never,
    );
    return runSummarySchema.parse({ run, counts: { results: views.length, linked, unlinked: views.length - linked, byStatus } });
  }

  // ---- the upload: raw bytes in its own scope --------------------------------
  void app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(RAW_TYPES, { parseAs: "buffer", bodyLimit: limits.bodyBytes }, (_req, body, done) =>
      done(null, body),
    );
    scope.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: limits.bodyBytes }, (_req, body, done) => done(null, body));

    scope.post(
      `${API_V1}/projects/:projectId/results`,
      {
        preHandler,
        bodyLimit: limits.bodyBytes,
        config: { rateLimit: { ...deps.rateLimit, max: limits.rateMax, timeWindow: limits.rateWindow } },
      },
      async (req, reply) => {
        const p = principal(req);
        const options = uploadQuerySchema.parse(req.query ?? {});
        const project = await resolveProject(pool, service, p, projectRef(req), "runs:write");
        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        const file = inflate(body, req.headers["content-encoding"], limits.fileBytes);
        const parsed = await parseUpload(deps.parser, file, options.format, limits.fileBytes);
        const mime = String(req.headers["content-type"] ?? "application/octet-stream").split(";")[0].trim();
        const out = await deps.runImport.upload({ principal: p, project, file, mime, parsed, options });
        return reply.code(out.shard.created ? 201 : 200).send(uploadResponseSchema.parse(out));
      },
    );
  });

  // ---- runs --------------------------------------------------------------------
  app.get(`${API_V1}/projects/:projectId/runs`, { preHandler, config }, async (req) => {
    const p = principal(req);
    const project = await resolveProject(pool, service, p, projectRef(req), "runs:read");
    return runListSchema.parse({ runs: await runs.list(p.ownerId, project.id) });
  });

  /** An empty run to upload into: with `externalId`, the one of that id
   *  (created once), so a CI matrix may create it from any job. */
  app.post(`${API_V1}/projects/:projectId/runs`, { preHandler, config }, async (req, reply) => {
    const p = principal(req);
    const input = runCreateSchema.parse(req.body ?? {});
    const project = await resolveProject(pool, service, p, projectRef(req), "runs:write");
    const id = input.externalId ? externalRunId(project.id, input.externalId) : undefined;
    const outcome = await store.tx(p.ownerId, async (tx) => {
      if (id) {
        const found = await tx.get("run", id);
        if (found && !found.deleted) return { id, created: false };
        if (found?.deleted) throw RunErrors.notFound(input.externalId!);
      }
      const findId = async (entity: string, field: string, value?: string) => {
        if (!value) return null;
        const doc = (await tx.list(entity, project.id)).find(
          (d) => String(d.payload[field] ?? "").trim().toLowerCase() === value.trim().toLowerCase(),
        );
        if (!doc) throw new AppError(404, "not_found", `${value} not found in this project.`);
        return doc.entityId;
      };
      const doc = await insertRun(
        tx,
        {
          projectId: project.id,
          title: input.name ?? input.externalId ?? "CI",
          trigger: "ci",
          environment: input.environment,
          build: input.build,
          commitSha: input.commitSha,
          branch: input.branch,
          ciUrl: input.ciUrl,
          cycleId: await findId("test_cycle", "cycleKey", input.cycleKey),
          configurationId: await findId("configuration", "name", input.configuration),
          context: input.externalId ? { externalId: input.externalId } : {},
        },
        id,
      );
      return { id: doc.entityId, created: true };
    });
    const run = await runs.get(p.ownerId, outcome.id);
    return reply.code(outcome.created ? 201 : 200).send(runSchema.parse(run));
  });

  app.get(`${API_V1}/projects/:projectId/runs/:runKey`, { preHandler, config }, async (req) => {
    const p = principal(req);
    const project = await resolveProject(pool, service, p, projectRef(req), "runs:read");
    const run = await runOf(p.ownerId, project.id, (req.params as { runKey: string }).runKey);
    return summary(p.ownerId, run);
  });

  app.get(`${API_V1}/projects/:projectId/runs/:runKey/results`, { preHandler, config }, async (req) => {
    const p = principal(req);
    const project = await resolveProject(pool, service, p, projectRef(req), "runs:read");
    const run = await runOf(p.ownerId, project.id, (req.params as { runKey: string }).runKey);
    const views = await runs.results(p.ownerId, String(run.id));
    return resultListSchema.parse({
      results: views.map((v) => ({ ...v, testCaseId: v.effectiveTestCaseId ?? null })),
    });
  });

  /** Closes a run: `completed` (default) or `aborted`. */
  app.post(`${API_V1}/projects/:projectId/runs/:runKey/close`, { preHandler, config }, async (req) => {
    const p = principal(req);
    const { status } = runCloseSchema.parse(req.body ?? {});
    const project = await resolveProject(pool, service, p, projectRef(req), "runs:write");
    const run = await runOf(p.ownerId, project.id, (req.params as { runKey: string }).runKey);
    if (run.status !== "in_progress") throw RunErrors.closed(String(run.runKey));
    await runs.close(p.ownerId, String(run.id), status);
    return summary(p.ownerId, (await runs.get(p.ownerId, String(run.id))) as Json);
  });

  // A token without the scope never learns whether the project exists.
  void TokenErrors;
}
