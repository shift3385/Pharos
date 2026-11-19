// Findings, metrics and triage on the web (ING-06, ADR-0053): the server's
// side of the run detail's «Hallazgos» and «Métricas» tabs, the twin of the
// desktop's `runs/findings.rs` (`list_findings`, `list_metrics`,
// `triage_add`, `triage_history`). It reads the `finding`, `metric` and
// `finding_triage` documents the desktops push; a triage decision from the
// web is one more `finding_triage` event (append-only, `run.execute`).

import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../auth/errors.js";
import { makeRequireAuth } from "../auth/middleware.js";
import type { TokenService } from "../auth/tokens.js";
import type { RemoteDoc } from "../sync/sync.repository.js";
import { requireSupportedVersion } from "../sync/sync.version.js";
import type { DomainStore, DomainTx } from "./domain.store.js";
import { supersededShards } from "./resultLink.js";
import { isLiveRun } from "./run-live.js";

/** The shards of a project a newer normalizer replaced: their findings and
 *  metrics are left out, like results (`CURRENT_SHARD` on the desktop). */
const supersededOf = async (tx: DomainTx, projectId: string) =>
  supersededShards(await tx.list("run_shard", projectId));

export const SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;
export const TRIAGE_STATES = [
  "open",
  "false_positive",
  "accepted_risk",
  "fixed",
] as const;
const MAX_REASON = 2000;

export interface TriageEvent {
  id: string;
  fingerprint: string;
  state: string;
  reason: string | null;
  defectId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface FindingView {
  id: string;
  runId: string;
  shardId: string;
  ruleId: string;
  ruleName: string | null;
  severity: string;
  rawSeverity: string | null;
  message: string;
  location: Record<string, unknown>;
  fingerprint: string;
  standardRefs: string[];
  helpUri: string | null;
  attributes: Record<string, unknown>;
  triage: TriageEvent | null;
  isNew: boolean;
}

export interface MetricView {
  id: string;
  runId: string;
  shardId: string;
  name: string;
  aggregation: string | null;
  scope: string | null;
  value: number;
  unit: string | null;
  threshold: string | null;
  passed: boolean | null;
  attributes: Record<string, unknown>;
}

type Payload = Record<string, unknown>;
const s = (p: Payload, k: string): string | null =>
  typeof p[k] === "string" ? (p[k] as string) : null;
const o = (p: Payload, k: string): Record<string, unknown> =>
  p[k] && typeof p[k] === "object" && !Array.isArray(p[k])
    ? (p[k] as Record<string, unknown>)
    : {};
const bad = (message: string) => new AppError(400, "invalid_triage", message);
const rank = (severity: string) => {
  const i = (SEVERITIES as readonly string[]).indexOf(severity);
  return i < 0 ? SEVERITIES.length : i;
};
const when = (run: RemoteDoc) =>
  s(run.payload, "startedAt") ?? s(run.payload, "createdAt") ?? "";
/** Run order for «previous»: start, then creation, then id (the desktop's). */
const order = (run: RemoteDoc) => [
  when(run),
  s(run.payload, "createdAt") ?? "",
  run.entityId,
];
const before = (a: RemoteDoc, b: RemoteDoc) => {
  const [x, y] = [order(a), order(b)];
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};

const eventOf = (d: RemoteDoc): TriageEvent => ({
  id: d.entityId,
  fingerprint: s(d.payload, "fingerprint") ?? "",
  state: s(d.payload, "state") ?? "open",
  reason: s(d.payload, "reason"),
  defectId: s(d.payload, "defectId"),
  createdBy: s(d.payload, "createdBy") ?? "",
  createdAt: s(d.payload, "createdAt") ?? "",
});

/** Newest first: HLC, then id (the desktop's order). */
const newestFirst = (a: RemoteDoc, b: RemoteDoc) => {
  const ha = s(a.payload, "hlc") ?? "";
  const hb = s(b.payload, "hlc") ?? "";
  if (ha !== hb) return ha < hb ? 1 : -1;
  return a.entityId < b.entityId ? 1 : a.entityId > b.entityId ? -1 : 0;
};

/** The current decision on each fingerprint of the project (`triage_current`). */
async function triageCurrent(
  tx: DomainTx,
  projectId: string,
): Promise<Map<string, TriageEvent>> {
  const out = new Map<string, TriageEvent>();
  for (const d of (await tx.list("finding_triage", projectId)).sort(
    newestFirst,
  )) {
    const fp = s(d.payload, "fingerprint");
    if (fp && !out.has(fp)) out.set(fp, eventOf(d));
  }
  return out;
}

/** The fingerprints of the previous run of the project from the same tool,
 *  or null if there is none (`previous_fingerprints`). */
async function previousFingerprints(
  tx: DomainTx,
  run: RemoteDoc,
  projectId: string,
): Promise<Set<string> | null> {
  const tool = s(run.payload, "sourceTool") ?? "";
  const findings = await tx.list("finding", projectId);
  const withFindings = new Set(findings.map((d) => s(d.payload, "runId")));
  const earlier = (await tx.list("run", projectId))
    .filter(isLiveRun)
    .filter(
      (r) =>
        r.entityId !== run.entityId &&
        withFindings.has(r.entityId) &&
        (s(r.payload, "sourceTool") ?? "") === tool &&
        before(r, run),
    )
    .sort((a, b) => (before(a, b) ? 1 : before(b, a) ? -1 : 0));
  const previous = earlier[0];
  if (!previous) return null;
  return new Set(
    findings
      .filter((d) => s(d.payload, "runId") === previous.entityId)
      .map((d) => s(d.payload, "fingerprint") ?? ""),
  );
}

/** What the runs list shows of a run's findings (F5b, `add_finding_counts`). */
export interface RunFindingCounts {
  /** Open: neither triaged nor «A revisar». */
  findings: number;
  findingsWorst: string | null;
  thresholdsFailed: number;
}

/** The open findings and failed thresholds of every live run of a project,
 *  by run id (current shards only). */
export async function findingCountsOf(
  tx: DomainTx,
  projectId: string,
): Promise<Map<string, RunFindingCounts>> {
  const live = new Set((await tx.list("run", projectId)).filter(isLiveRun).map((d) => d.entityId));
  const superseded = await supersededOf(tx, projectId);
  const current = (d: RemoteDoc) =>
    live.has(s(d.payload, "runId") ?? "") && !superseded.has(s(d.payload, "shardId") ?? "");
  const out = new Map<string, RunFindingCounts>();
  const entry = (runId: string) => {
    let c = out.get(runId);
    if (!c) out.set(runId, (c = { findings: 0, findingsWorst: null, thresholdsFailed: 0 }));
    return c;
  };
  const triage = await triageCurrent(tx, projectId);
  for (const d of (await tx.list("finding", projectId)).filter(current)) {
    const c = entry(s(d.payload, "runId") ?? "");
    const state = triage.get(s(d.payload, "fingerprint") ?? "")?.state;
    if ((state && state !== "open") || o(d.payload, "attributes").needsReview === true) continue;
    const severity = s(d.payload, "severity") ?? "info";
    c.findings++;
    if (c.findingsWorst === null || rank(severity) < rank(c.findingsWorst)) c.findingsWorst = severity;
  }
  for (const d of (await tx.list("metric", projectId)).filter(current)) {
    if (d.payload.passed === false) entry(s(d.payload, "runId") ?? "").thresholdsFailed++;
  }
  return out;
}

export function createFindingService(store: DomainStore) {
  const write = store.tx.bind(store);
  const read = store.readTx.bind(store);

  return {
    /** `run_findings_list`: worst first, with the current triage and `isNew`. */
    findings: (userId: string, runId: string): Promise<FindingView[]> =>
      read(userId, async (tx) => {
        const run = await tx.get("run", runId);
        if (!isLiveRun(run)) return [];
        const projectId = s(run.payload, "projectId") ?? "";
        const triage = await triageCurrent(tx, projectId);
        const previous = await previousFingerprints(tx, run, projectId);
        const superseded = await supersededOf(tx, projectId);
        const docs = (await tx.list("finding", projectId)).filter(
          (d) => s(d.payload, "runId") === runId && !superseded.has(s(d.payload, "shardId") ?? ""),
        );
        return docs
          .map((d): FindingView => {
            const p = d.payload;
            const fingerprint = s(p, "fingerprint") ?? "";
            return {
              id: d.entityId,
              runId,
              shardId: s(p, "shardId") ?? "",
              ruleId: s(p, "ruleId") ?? "",
              ruleName: s(p, "ruleName"),
              severity: s(p, "severity") ?? "info",
              rawSeverity: s(p, "rawSeverity"),
              message: s(p, "message") ?? "",
              location: o(p, "location"),
              fingerprint,
              standardRefs: Array.isArray(p.standardRefs)
                ? (p.standardRefs as unknown[]).map(String)
                : [],
              helpUri: s(p, "helpUri"),
              attributes: o(p, "attributes"),
              triage: triage.get(fingerprint) ?? null,
              isNew: previous !== null && !previous.has(fingerprint),
            };
          })
          .sort(
            (a, b) =>
              rank(a.severity) - rank(b.severity) ||
              (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0) ||
              (a.id < b.id ? -1 : 1),
          );
      }),

    /** `run_metrics_list`: failed thresholds first, then name, scope, aggregation. */
    metrics: (userId: string, runId: string): Promise<MetricView[]> =>
      read(userId, async (tx) => {
        const run = await tx.get("run", runId);
        if (!isLiveRun(run)) return [];
        const projectId = s(run.payload, "projectId") ?? "";
        const key = (m: MetricView) =>
          [
            m.passed === false ? "0" : "1",
            m.name,
            m.scope ?? "",
            m.aggregation ?? "",
            m.id,
          ].join("\u0000");
        const superseded = await supersededOf(tx, projectId);
        return (await tx.list("metric", projectId))
          .filter((d) => s(d.payload, "runId") === runId && !superseded.has(s(d.payload, "shardId") ?? ""))
          .map((d): MetricView => {
            const p = d.payload;
            return {
              id: d.entityId,
              runId,
              shardId: s(p, "shardId") ?? "",
              name: s(p, "name") ?? "",
              aggregation: s(p, "aggregation"),
              scope: s(p, "scope"),
              value: typeof p.value === "number" ? p.value : Number(p.value),
              unit: s(p, "unit"),
              threshold: s(p, "threshold"),
              passed: typeof p.passed === "boolean" ? p.passed : null,
              attributes: o(p, "attributes"),
            };
          })
          .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
      }),

    /** `finding_triage_history`: the decisions on a fingerprint, newest first. */
    history: (
      userId: string,
      projectId: string,
      fingerprint: string,
    ): Promise<TriageEvent[]> =>
      read(userId, async (tx) => {
        const project = await tx.get("project", projectId);
        if (!project || project.deleted) return [];
        return (await tx.list("finding_triage", projectId))
          .filter((d) => s(d.payload, "fingerprint") === fingerprint)
          .sort(newestFirst)
          .map(eventOf);
      }),

    /** `finding_triage_set`: one more decision; returns it (the current one). */
    triage: (
      userId: string,
      input: {
        projectId: string;
        fingerprint: string;
        state: string;
        reason?: string | null;
        defectId?: string | null;
      },
    ): Promise<TriageEvent> =>
      write(userId, async (tx) => {
        const project = await tx.get("project", input.projectId);
        if (!project || project.deleted)
          throw new AppError(404, "not_found", "project-not-found");
        const fingerprint = input.fingerprint.trim();
        if (!fingerprint) throw bad("invalid-triage: fingerprint");
        if (!(TRIAGE_STATES as readonly string[]).includes(input.state))
          throw bad(`invalid-triage: state ${input.state}`);
        const reason = input.reason?.trim() || null;
        if (input.state !== "open" && !reason)
          throw bad("invalid-triage: reason");
        const id = randomUUID();
        const payload = {
          id,
          projectId: input.projectId,
          fingerprint,
          state: input.state,
          reason: reason ? reason.slice(0, MAX_REASON) : null,
          defectId: input.defectId?.trim() || null,
          createdBy: userId,
          createdAt: new Date().toISOString(),
          hlc: tx.stamp(),
        };
        await tx.append("finding_triage", id, payload);
        // A judgement: it goes to the audit trail too, as on the desktop.
        await tx.audit(
          "create",
          "finding_triage",
          id,
          {},
          {
            fingerprint: [null, payload.fingerprint],
            state: [null, payload.state],
            reason: [null, payload.reason],
            ...(payload.defectId ? { defectId: [null, payload.defectId] } : {}),
          },
        );
        return eventOf({ entityId: id, payload } as unknown as RemoteDoc);
      }),
  };
}

export type FindingService = ReturnType<typeof createFindingService>;

const triageBody = z.object({
  projectId: z.string().min(1).max(200),
  fingerprint: z.string().min(1).max(1000),
  state: z.string().max(50),
  reason: z.string().max(MAX_REASON).nullable().optional(),
  defectId: z.string().max(200).nullable().optional(),
});

/** `/api/runs/:id/findings`, `/api/runs/:id/metrics` and `/api/finding-triage`. */
export function findingRoutes(
  app: FastifyInstance,
  deps: { findings: FindingService; tokens: TokenService },
) {
  const { findings } = deps;
  const preHandler = [makeRequireAuth(deps.tokens), requireSupportedVersion];
  const user = (req: FastifyRequest) => req.userId as string;
  const id = (req: FastifyRequest) => (req.params as { id: string }).id;

  app.get("/api/runs/:id/findings", { preHandler }, (req) =>
    findings.findings(user(req), id(req)),
  );
  app.get("/api/runs/:id/metrics", { preHandler }, (req) =>
    findings.metrics(user(req), id(req)),
  );
  app.get("/api/finding-triage", { preHandler }, (req) => {
    const q = z
      .object({
        projectId: z.string().min(1).max(200),
        fingerprint: z.string().min(1).max(1000),
      })
      .parse(req.query);
    return findings.history(user(req), q.projectId, q.fingerprint);
  });
  app.post("/api/finding-triage", { preHandler }, (req) =>
    findings.triage(user(req), triageBody.parse(req.body)),
  );
}
