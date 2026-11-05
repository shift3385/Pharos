// The execution derivation on the web (step 10, EJE-04/EJE-03; contract v1):
// the loader twin of the desktop's `execution.rs` and the route the matrix and
// the status report read. One read per entity of the project, then the pure
// twin (`execution-summary.ts`). A manual result carries its link; an imported
// one gets it from the link resolver (`resultLink.ts`); superseded shards are
// left out. Reads only.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { makeRequireAuth } from "../auth/middleware";
import type { TokenService } from "../auth/tokens";
import type { RemoteDoc } from "../sync/sync.repository";
import { requireSupportedVersion } from "../sync/sync.version";
import type { DomainStore, DomainTx } from "./domain.store";
import { linkContext, withLinks } from "./defects";
import {
  home,
  summarize,
  type AttemptData,
  type ExecutionFilter,
  type HomeMetrics,
  type HomeRequest,
  type ProjectData,
} from "./execution-summary";
import { isImported, projectLinks, supersededShards } from "./resultLink";
import { sortable } from "./domain.service";

type Payload = Record<string, unknown>;
const str = (p: Payload, k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
const strOrNull = (p: Payload, k: string) => (typeof p[k] === "string" && p[k] !== "" ? (p[k] as string) : null);
const numOrNull = (p: Payload, k: string) => (typeof p[k] === "number" ? (p[k] as number) : null);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const obj = (v: unknown): Payload => (v && typeof v === "object" && !Array.isArray(v) ? (v as Payload) : {});

/** Everything the derivation reads of a live project; null if it is not the
 *  user's (the store is per user) or is deleted. */
export async function loadProject(tx: DomainTx, projectId: string): Promise<ProjectData | null> {
  const project = await tx.get("project", projectId);
  if (!project || project.deleted) return null;
  const [runDocs, shardDocs, resultDocs, caseDocs, requirementDocs, defectDocs, cycleDocs, itemDocs, planDocs] =
    await Promise.all([
      tx.list("run", projectId),
      tx.list("run_shard", projectId),
      tx.list("result", projectId),
      tx.list("test_case", projectId, { withDeleted: true }),
      tx.list("requirement", projectId),
      tx.list("defect", projectId),
      tx.list("test_cycle", projectId),
      tx.list("test_cycle_item", projectId),
      tx.list("test_plan"),
    ]);
  const liveRuns = new Map(runDocs.map((d) => [d.entityId, d.payload] as const));
  const shards = new Map(shardDocs.map((d) => [d.entityId, d.payload] as const));
  const superseded = supersededShards(shardDocs);
  let links: Awaited<ReturnType<typeof projectLinks>> | null = null;
  const attempts: AttemptData[] = [];
  for (const d of resultDocs) {
    const p = d.payload;
    const run = liveRuns.get(str(p, "runId"));
    if (!run) continue;
    const shardId = str(p, "shardId");
    if (superseded.has(shardId)) continue;
    const imported = isImported(p);
    const shard = shards.get(shardId);
    const a: AttemptData = {
      id: d.entityId,
      runId: str(p, "runId"),
      testKey: str(p, "testKey"),
      configurationLabel: strOrNull(p, "configurationLabel"),
      attempt: numOrNull(p, "attempt") ?? 0,
      status: str(p, "status"),
      startedAt: strOrNull(p, "startedAt"),
      finishedAt: strOrNull(p, "finishedAt"),
      shardImportedAt: shard ? strOrNull(shard, "importedAt") : null,
      hlc: str(p, "hlc"),
      declaredFlaky: obj(p.attributes).flaky === true,
      imported,
      configurationId: strOrNull(run, "configurationId") ?? strOrNull(p, "configurationId"),
      caseId: strOrNull(p, "testCaseId"),
      flowId: strOrNull(p, "flowId"),
      rowId: strOrNull(p, "exampleRowId"),
      revisionId: strOrNull(p, "testCaseRevisionId"),
      caseRevision: numOrNull(p, "caseRevision"),
    };
    if (imported) {
      links ??= await projectLinks(tx, projectId, { run: runDocs, test_cycle_item: itemDocs, test_case: caseDocs });
      const l = links(p);
      a.caseId = l.caseId;
      a.flowId = l.flowId;
      a.rowId = l.exampleRowId;
      a.revisionId = l.revisionId;
      a.caseRevision = l.caseRevision;
      a.configurationId = strOrNull(run, "configurationId") ?? l.configurationId;
    }
    attempts.push(a);
  }
  const ctx = await linkContext(tx, projectId);
  const defects = defectDocs.map((d) => {
    const v = withLinks(ctx, d);
    const own = (v.links as { targetKind: string; targetId: string }[]) ?? [];
    return {
      id: d.entityId,
      defectKey: str(d.payload, "defectKey"),
      severity: str(d.payload, "severity"),
      status: str(d.payload, "status"),
      caseIds: strings(v.caseIds),
      requirementIds: own.filter((l) => l.targetKind === "requirement").map((l) => l.targetId),
    };
  });
  const plans = planDocs
    .filter((d) => str(d.payload, "projectId") === projectId)
    .sort((a, b) => {
      const [x, y] = [sortable(str(a.payload, "updatedAt")), sortable(str(b.payload, "updatedAt"))];
      return x < y ? 1 : x > y ? -1 : 0;
    });
  const plan = plans[0];
  return {
    projectId,
    runs: runDocs.map((d) => ({
      id: d.entityId,
      runKey: str(d.payload, "runKey"),
      title: str(d.payload, "title"),
      trigger: str(d.payload, "trigger"),
      sourceTool: strOrNull(d.payload, "sourceTool"),
      status: str(d.payload, "status"),
      startedAt: strOrNull(d.payload, "startedAt"),
      createdAt: str(d.payload, "createdAt"),
      cycleId: strOrNull(d.payload, "cycleId"),
      testPlanId: strOrNull(d.payload, "testPlanId"),
      configurationId: strOrNull(d.payload, "configurationId"),
      build: strOrNull(d.payload, "build"),
      environment: strOrNull(d.payload, "environment"),
    })),
    attempts,
    cases: caseDocs
      .filter((d) => !d.deleted)
      .map((d: RemoteDoc) => ({
        id: d.entityId,
        scenarioId: str(d.payload, "scenarioId"),
        title: str(d.payload, "title"),
        status: str(d.payload, "status"),
        priority: str(d.payload, "priority"),
        requirementKeys: strings(obj(d.payload.data).requirementKeys),
        revision: d.revision,
      })),
    requirements: requirementDocs.map((d) => ({
      id: d.entityId,
      requirementKey: str(d.payload, "requirementKey"),
      title: str(d.payload, "title"),
      priority: str(d.payload, "priority"),
      riskLikelihood: numOrNull(d.payload, "riskLikelihood"),
      riskImpact: numOrNull(d.payload, "riskImpact"),
    })),
    defects,
    cycles: cycleDocs.map((d) => ({
      id: d.entityId,
      testPlanId: strOrNull(d.payload, "testPlanId"),
      configurationIds: strings(d.payload.configurationIds),
    })),
    cycleItems: itemDocs
      .map((d) => ({
        id: d.entityId,
        cycleId: str(d.payload, "cycleId"),
        caseId: str(d.payload, "testCaseId"),
        flowId: strOrNull(d.payload, "flowId"),
        rowId: strOrNull(d.payload, "exampleRowId"),
        position: numOrNull(d.payload, "position") ?? 0,
      }))
      .sort((a, b) => (a.cycleId < b.cycleId ? -1 : a.cycleId > b.cycleId ? 1 : a.position - b.position))
      .map(({ position: _position, ...i }) => i),
    planCriteria: plan
      ? (Array.isArray(obj(plan.payload.data).closureCriteria) ? (obj(plan.payload.data).closureCriteria as unknown[]) : []).map(
          (c) => ({ criterion: str(obj(c), "criterion"), metric: str(obj(c), "metric") }),
        )
      : null,
  };
}

export function createExecutionService(store: DomainStore) {
  const run = store.tx.bind(store);
  return {
    /** The summary of one project (`execution_summary` on the desktop); null
     *  if the project is not the user's. */
    summary: (userId: string, filter: ExecutionFilter) =>
      run(userId, async (tx) => {
        const data = await loadProject(tx, filter.projectId);
        return data ? summarize(data, filter) : null;
      }),
    /** The Home metrics (RED-W6's `GET /api/home/metrics` calls this). */
    homeMetrics: (userId: string, request: HomeRequest): Promise<HomeMetrics> =>
      run(userId, async (tx) => {
        const ids =
          request.projectIds ??
          (await tx.list("project"))
            .sort((a, b) => {
              const [x, y] = [sortable(str(a.payload, "updatedAt")), sortable(str(b.payload, "updatedAt"))];
              return x < y ? 1 : x > y ? -1 : 0;
            })
            .map((d) => d.entityId);
        const projects: ProjectData[] = [];
        for (const id of ids) {
          const data = await loadProject(tx, id);
          if (data) projects.push(data);
        }
        return home(projects, request);
      }),
  };
}

export type ExecutionService = ReturnType<typeof createExecutionService>;

const optText = z
  .string()
  .max(500)
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));
const ms = z.coerce.number().int().optional().transform((v) => v ?? null);

export const summaryQuerySchema = z.object({
  projectId: z.string().min(1).max(200),
  cycleId: optText,
  testPlanId: optText,
  configurationId: optText,
  build: optText,
  environment: optText,
  from: ms,
  to: ms,
  /** Comma-separated epoch ms. */
  dayStarts: z
    .string()
    .max(20_000)
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const out = v.split(",").map(Number);
      if (out.some((n) => !Number.isInteger(n)) || out.length > 400) {
        ctx.addIssue({ code: "custom", message: "dayStarts: comma-separated integers, at most 400" });
        return z.NEVER;
      }
      return out;
    }),
});

/** `GET /api/execution/summary` (BASE-10): the matrix and the status report of
 *  the web read the same derivation as the desktop. */
export function executionRoutes(app: FastifyInstance, deps: { execution: ExecutionService; tokens: TokenService }) {
  const preHandler = [makeRequireAuth(deps.tokens), requireSupportedVersion];
  const user = (req: FastifyRequest) => req.userId as string;
  app.get("/api/execution/summary", { preHandler }, (req) =>
    deps.execution.summary(user(req), summaryQuerySchema.parse(req.query)),
  );
}
