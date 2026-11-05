// The execution derivation on the web (step 10, EJE-04/EJE-03; contract v1):
// the loader twin of the desktop's `execution.rs` and the route the matrix and
// the status report read. One lock-free read per entity kind for every
// project asked for, then the pure twin (`execution-summary.ts`), after the
// read ends. A manual result carries its link; an imported
// one gets it from the link resolver (`resultLink.ts`); superseded shards are
// left out. Reads only.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../auth/errors";
import { makeRequireAuth } from "../auth/middleware";
import type { TokenService } from "../auth/tokens";
import type { RemoteDoc } from "../sync/sync.repository";
import { requireSupportedVersion } from "../sync/sync.version";
import { createHash } from "node:crypto";
import type { DomainReader, DomainStore } from "./domain.store";
import { withLinks, type LinkContext } from "./defects";
import {
  home,
  summarize,
  type AttemptData,
  type ExecutionFilter,
  type HomeMetrics,
  type HomeRequest,
  type ProjectData,
} from "./execution-summary";
import { factsOf, isImported, linkDataOf, linkResolver, supersededShards, type ResultLink } from "./resultLink";
import { sortable } from "./domain.service";

type Payload = Record<string, unknown>;
const str = (p: Payload, k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
const strOrNull = (p: Payload, k: string) => (typeof p[k] === "string" && p[k] !== "" ? (p[k] as string) : null);
const numOrNull = (p: Payload, k: string) => (typeof p[k] === "number" ? (p[k] as number) : null);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const obj = (v: unknown): Payload => (v && typeof v === "object" && !Array.isArray(v) ? (v as Payload) : {});

/** What of a case is executed (the desktop's `EXEC_KEYS`): a change to
 *  anything else (title, status, priority, key, tags, custom fields) never
 *  makes a result outdated. */
const EXEC_KEYS = [
  "gherkinLevel",
  "preconditions",
  "background",
  "steps",
  "expectedResult",
  "examples",
  "flows",
  "featureSource",
  "testData",
] as const;

/** JSON with object keys in order and without `id` keys (a step's, a flow's
 *  or a row's id is its identity, not its content), so equal content gives
 *  equal text. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Payload;
    return `{${Object.keys(o)
      .filter((k) => k !== "id")
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Fingerprint of the executable content of a case's `data` (empty values and
 *  the default level count as absent). Only compared on this side. */
export function execFingerprint(data: unknown): string {
  const d = obj(data);
  const kept: Payload = {};
  for (const k of EXEC_KEYS) {
    const v = d[k];
    const empty =
      v === undefined ||
      v === null ||
      (typeof v === "string" && (v === "" || (k === "gherkinLevel" && v === "basic"))) ||
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === "object" && !Array.isArray(v) && v !== null && Object.keys(v).length === 0);
    if (!empty) kept[k] = v;
  }
  return createHash("sha256").update(canonical(kept)).digest("hex");
}

/** The entity kinds the derivation reads; each is read once for every
 *  project asked for (`payload->>'projectId' = ANY(...)`), whatever their
 *  number. */
const KINDS = [
  "run",
  "run_shard",
  "result",
  "test_case",
  "test_case_revision",
  "requirement",
  "defect",
  "defect_link",
  "test_cycle",
  "test_cycle_item",
  "test_plan",
  "unlinked_mapping",
  "run_item",
  "configuration",
] as const;
type Kind = (typeof KINDS)[number];

const byUpdatedDesc = (a: RemoteDoc, b: RemoteDoc) => {
  const [x, y] = [sortable(str(a.payload, "updatedAt")), sortable(str(b.payload, "updatedAt"))];
  return x < y ? 1 : x > y ? -1 : 0;
};

/** Everything the derivation reads of the user's live projects `ids` (all of
 *  them when null), most recently updated first. Reads without locks, one
 *  query per entity kind plus one for the projects: the cost does not grow
 *  with the number of projects. */
export async function loadProjects(r: DomainReader, ids: string[] | null): Promise<ProjectData[]> {
  const projects = (await r.projects(ids ? [...new Set(ids)] : null)).sort(byUpdatedDesc);
  if (projects.length === 0) return [];
  const projectIds = projects.map((p) => p.entityId);
  const grouped = new Map<Kind, Map<string, RemoteDoc[]>>();
  for (const kind of KINDS) {
    const groups = new Map<string, RemoteDoc[]>();
    // Cases with their tombstones: the link resolver needs a deleted case's
    // key. Runs too (EJE-07): a defect's link to a result of a deleted run
    // keeps its label and its case, as in `linkContext`.
    for (const d of await r.list(kind, projectIds, { withDeleted: kind === "test_case" || kind === "run" })) {
      const pid = str(d.payload, "projectId");
      groups.set(pid, [...(groups.get(pid) ?? []), d]);
    }
    grouped.set(kind, groups);
  }
  const ordered = ids ? ids.filter((id, i) => ids.indexOf(id) === i) : projectIds;
  return ordered
    .map((id) => projects.find((p) => p.entityId === id))
    .filter((p): p is RemoteDoc => !!p)
    .map((p) => projectData(p, (k) => grouped.get(k)?.get(p.entityId) ?? []));
}

/** One project's data from the lists already read (no query). */
function projectData(project: RemoteDoc, docs: (kind: Kind) => RemoteDoc[]): ProjectData {
  const projectId = project.entityId;
  const allRuns = docs("run");
  const runDocs = allRuns.filter((d) => !d.deleted);
  const shardDocs = docs("run_shard");
  const allCases = docs("test_case");
  const liveCases = allCases.filter((d) => !d.deleted);
  const liveRuns = new Map(runDocs.map((d) => [d.entityId, d.payload] as const));
  const shards = new Map(shardDocs.map((d) => [d.entityId, d.payload] as const));
  const superseded = supersededShards(shardDocs);
  // The link of imported results, built once from the lists in hand.
  let resolve: ((result: Payload) => ResultLink) | null = null;
  const linkOf = (p: Payload) => {
    resolve ??= ((fn) => (x: Payload) => fn(factsOf(x)))(
      linkResolver(
        linkDataOf(str(project.payload, "caseIdPrefix") || "ATS_", {
          test_case: allCases,
          test_case_revision: docs("test_case_revision"),
          unlinked_mapping: docs("unlinked_mapping"),
          run: allRuns,
          run_item: docs("run_item"),
          configuration: docs("configuration"),
          test_cycle_item: docs("test_cycle_item"),
        }),
      ),
    );
    return resolve(p);
  };
  const revisionData = new Map(docs("test_case_revision").map((d) => [d.entityId, d.payload.data] as const));
  const attempts: AttemptData[] = [];
  const resultDocs = docs("result");
  for (const d of resultDocs) {
    const p = d.payload;
    // A deleted run (EJE-07) keeps its results live: they are hidden here.
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
    };
    if (imported) {
      const l = linkOf(p);
      a.caseId = l.caseId;
      a.flowId = l.flowId;
      a.rowId = l.exampleRowId;
      a.revisionId = l.revisionId;
      a.configurationId = strOrNull(run, "configurationId") ?? l.configurationId;
    }
    const executed = a.revisionId ? revisionData.get(a.revisionId) : undefined;
    a.execFingerprint = executed === undefined ? null : execFingerprint(executed);
    attempts.push(a);
  }
  // The defects' links, with the lists in hand (the defects module's rule).
  const requirementDocs = docs("requirement");
  const byId = new Map<string, RemoteDoc>();
  for (const d of [...liveCases, ...requirementDocs, ...resultDocs, ...allRuns]) byId.set(`${d.entity}:${d.entityId}`, d);
  const ctx: LinkContext = { links: docs("defect_link"), byId, derive: linkOf };
  const defects = docs("defect").map((d) => {
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
  const plan = [...docs("test_plan")].sort(byUpdatedDesc)[0];
  const criteria = plan ? obj(plan.payload.data).closureCriteria : undefined;
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
    cases: liveCases.map((d) => ({
      id: d.entityId,
      scenarioId: str(d.payload, "scenarioId"),
      title: str(d.payload, "title"),
      status: str(d.payload, "status"),
      priority: str(d.payload, "priority"),
      requirementKeys: strings(obj(d.payload.data).requirementKeys),
      execFingerprint: execFingerprint(d.payload.data),
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
    cycles: docs("test_cycle").map((d) => ({
      id: d.entityId,
      testPlanId: strOrNull(d.payload, "testPlanId"),
      configurationIds: strings(d.payload.configurationIds),
    })),
    cycleItems: docs("test_cycle_item")
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
      ? (Array.isArray(criteria) ? criteria : []).map((c) => ({
          criterion: str(obj(c), "criterion"),
          metric: str(obj(c), "metric"),
        }))
      : null,
  };
}

/** `dayStarts` (the desktop's `check_day_starts`): 1 to 400 strictly
 *  ascending integers. */
export const MAX_DAY_STARTS = 400;
export function validDayStarts(ds: number[]): boolean {
  return (
    ds.length > 0 &&
    ds.length <= MAX_DAY_STARTS &&
    ds.every((n, i) => Number.isInteger(n) && (i === 0 || n > ds[i - 1]))
  );
}

export function createExecutionService(store: DomainStore) {
  return {
    /** The summary of one project (`execution_summary` on the desktop); null
     *  if the project is not the user's. Read without locks; derived after
     *  the read transaction ends. */
    summary: async (userId: string, filter: ExecutionFilter) => {
      const [data] = await store.read(userId, (r) => loadProjects(r, [filter.projectId]));
      return data ? summarize(data, filter) : null;
    },
    /** The Home metrics (RED-W6's `GET /api/home/metrics` calls this). */
    homeMetrics: async (userId: string, request: HomeRequest): Promise<HomeMetrics> => {
      if (!validDayStarts(request.dayStarts)) {
        throw new AppError(400, "invalid_day_starts", "dayStarts: 1 to 400 strictly ascending integers.");
      }
      const projects = await store.read(userId, (r) => loadProjects(r, request.projectIds ?? null));
      return home(projects, request);
    },
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
      if (!validDayStarts(out)) {
        ctx.addIssue({ code: "custom", message: "dayStarts: 1 to 400 strictly ascending integers" });
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
