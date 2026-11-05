import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../auth/errors";
import { makeRequireAuth } from "../auth/middleware";
import type { TokenService } from "../auth/tokens";
import type { RemoteDoc } from "../sync/sync.repository";
import { requireSupportedVersion } from "../sync/sync.version";
import { contentSha256, normalizeCaseData, revisionContent, revisionId, stepText } from "../sync/stable-steps";
import { finalAttempts, NOT_RUN, type ProgressAttempt } from "./cycle-progress";
import { staleWrite, type DomainStore, type DomainTx } from "./domain.store";
import { sortable, timestamp } from "./domain.service";
import { isImported, projectLinks, supersededShards, type ResultLink } from "./resultLink";
import { isLiveRun } from "./run-live";
import {
  flowShape,
  manualTestKey,
  narrow,
  overlaps,
  rowOf,
  targetKey,
  targetsOf,
  type ExecutionTarget,
} from "./runs-targets";

// Runs on the web (EJE-06, ADR-0013): the rules of the desktop's `runs.rs`,
// `runs/manual.rs` and `cycles.rs::execute` applied to the server's document
// store, writing the very documents the desktop writes and syncs (`run`,
// `run_item` lww; `result` append-only with its steps inside), so either side
// executes what the other planned and reads what the other recorded
// (`src-tauri/tests/fixtures/web-run-interop.json`). The execution draft is
// the browser's (localStorage), as it is the device's on the desktop: the
// server keeps none. Attachments stay on the desktop (SYNC-04b); report
// imports and the «Sin vincular» tray too.

type Payload = Record<string, unknown>;

const WORKSPACE = "local";
const KEY_PREFIX = "RUN-";
const KEY_DIGITS = 3;
const MAX_TITLE = 500;
const MAX_TEST_KEY = 2000;
const MAX_STEPS = 5000;
const RESULT_STATUSES = ["passed", "failed", "blocked", "skipped", "other"];
const RUN_STATUSES = ["in_progress", "completed", "aborted"];
/** An attempt id in the desktop's one form (`manual::normalize_attempt`,
 *  Rust's `Uuid::parse_str`): hyphenated, braced, `urn:uuid:` or 32 hex
 *  digits, any case, become lower-case hyphenated; anything else is null. */
export function normalizeAttempt(raw: string): string | null {
  let v = raw.trim();
  if (/^urn:uuid:/i.test(v)) v = v.slice(9);
  else if (v.startsWith("{") && v.endsWith("}")) v = v.slice(1, -1);
  const hex = /^[0-9a-f]{32}$/i.test(v)
    ? v
    : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
      ? v.replace(/-/g, "")
      : null;
  if (!hex) return null;
  const h = hex.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const str = (p: Payload, k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
const strOrNull = (p: Payload, k: string) => (typeof p[k] === "string" && p[k] !== "" ? (p[k] as string) : null);
const numOrNull = (p: Payload, k: string) => (typeof p[k] === "number" ? (p[k] as number) : null);
const num = (p: Payload, k: string) => (typeof p[k] === "number" ? (p[k] as number) : 0);
const obj = (v: unknown): Payload => (v && typeof v === "object" && !Array.isArray(v) ? (v as Payload) : {});
/** A non-empty trimmed text, or null (`runs::text`). */
const text = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);
/** `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`, the desktop's form of an instant. */
const instant = () => new Date().toISOString();
const bad = (message: string) => new AppError(400, "invalid_run", message);
const conflict = (code: string, message: string) => new AppError(409, code, message);
const notFound = (message: string) => new AppError(404, "not_found", message);
const byCreatedDesc = (a: RemoteDoc, b: RemoteDoc) => {
  const [x, y] = [sortable(str(a.payload, "createdAt")), sortable(str(b.payload, "createdAt"))];
  return x < y ? 1 : x > y ? -1 : b.seq - a.seq;
};

function within(field: string, value: string, max: number) {
  if (value.length > max) throw bad(`${field}-too-long: at most ${max} characters`);
}

export { isLiveRun };

/** Every write to a deleted run is refused with `run-deleted` (EJE-07),
 *  as on the desktop. */
const runDeleted = () => new AppError(409, "run_deleted", "run-deleted");

/** A live run of a live project (`runs::owned_run`): 409 `run-deleted` for
 *  a deleted one, 404 `run not found` if there is none. */
export async function liveRun(tx: DomainTx, id: string): Promise<RemoteDoc> {
  const run = await tx.get("run", id);
  if (run && run.deleted) throw runDeleted();
  if (!isLiveRun(run)) throw notFound("run not found");
  const project = await tx.get("project", str(run.payload, "projectId"));
  if (!project || project.deleted) throw notFound("run not found");
  return run;
}

function requireOpen(run: RemoteDoc) {
  if (str(run.payload, "status") !== "in_progress") throw conflict("run_closed", "run-closed");
}

// ---- inputs ----------------------------------------------------------------------

const t = (max: number) => z.string().max(max).nullish();
/** An instant in RFC 3339 with its zone (`2026-11-05T10:00:00.000Z`); the
 *  derivation orders attempts by it (`instant_ms`). */
const instantText = z.iso.datetime({ offset: true }).nullish();

export const runInputSchema = z.object({
  projectId: t(200),
  title: t(2000),
  trigger: t(50),
  sourceTool: t(200),
  sourceToolVersion: t(200),
  testPlanId: t(200),
  cycleId: t(200),
  configurationId: t(200),
  environment: t(200),
  build: t(200),
  commitSha: t(200),
  branch: t(500),
  repositoryUrl: t(2000),
  ciUrl: t(2000),
  dataset: t(500),
  context: z.record(z.string(), z.unknown()).nullish(),
  status: t(50),
  startedAt: instantText,
  finishedAt: instantText,
});

export const runItemInputSchema = z.object({
  testCaseId: z.string().min(1).max(200),
  flowId: t(200),
  exampleRowId: t(200),
  exampleRow: z.number().int().nonnegative().nullish(),
  configurationId: t(200),
  assignee: t(200),
});

const stepInputSchema = z.object({
  stepId: t(200),
  keyword: t(100),
  text: z.string().max(100_000),
  status: z.string().max(50),
  actual: z.string().max(100_000).nullish(),
  durationMs: z.number().int().nonnegative().nullish(),
  gherkinLine: z.number().int().nonnegative().nullish(),
});

export const resultInputSchema = z.object({
  runItemId: z.string().min(1).max(200),
  flowId: t(200),
  exampleRowId: t(200),
  attemptId: t(100),
  status: z.string().max(50),
  rawStatus: t(200),
  configurationLabel: t(200),
  durationMs: z.number().int().nonnegative().nullish(),
  startedAt: instantText,
  finishedAt: instantText,
  errorMessage: z.string().max(100_000).nullish(),
  errorTrace: z.string().max(1_000_000).nullish(),
  attributes: z.record(z.string(), z.unknown()).nullish(),
  steps: z.array(stepInputSchema).max(MAX_STEPS + 1).nullish(),
});

export const executeInputSchema = z.object({
  configurationIds: z.array(z.string().max(200)).max(500).nullish(),
  title: t(2000),
  build: t(200),
  environment: t(200),
});

export type RunInput = z.infer<typeof runInputSchema>;
export type RunItemInput = z.infer<typeof runItemInputSchema>;
export type ResultInput = z.infer<typeof resultInputSchema>;
export type ExecuteInput = z.infer<typeof executeInputSchema>;

// ---- views (the desktop's `Run`, `RunItem`, `ResultView`…) ------------------------

const RUN_TEXT = [
  "sourceTool",
  "sourceToolVersion",
  "testPlanId",
  "cycleId",
  "configurationId",
  "environment",
  "build",
  "commitSha",
  "branch",
  "repositoryUrl",
  "ciUrl",
  "dataset",
] as const;

function runView(d: RemoteDoc) {
  const p = d.payload;
  const out: Payload = {
    id: d.entityId,
    projectId: str(p, "projectId"),
    runKey: str(p, "runKey"),
    title: str(p, "title"),
    trigger: str(p, "trigger") || "manual",
  };
  for (const k of RUN_TEXT) out[k] = strOrNull(p, k);
  return {
    ...out,
    context: obj(p.context),
    status: RUN_STATUSES.includes(str(p, "status")) ? str(p, "status") : "in_progress",
    startedAt: strOrNull(p, "startedAt"),
    finishedAt: strOrNull(p, "finishedAt"),
    summary: obj(p.summary),
    data: obj(p.data),
    createdBy: d.author,
    createdAt: str(p, "createdAt"),
    updatedAt: str(p, "updatedAt"),
    revision: d.revision,
  };
}

function itemView(d: RemoteDoc) {
  const p = d.payload;
  return {
    id: d.entityId,
    runId: str(p, "runId"),
    testCaseId: str(p, "testCaseId"),
    testCaseRevisionId: str(p, "testCaseRevisionId"),
    flowId: strOrNull(p, "flowId"),
    exampleRowId: strOrNull(p, "exampleRowId"),
    exampleRow: numOrNull(p, "exampleRow"),
    configurationId: strOrNull(p, "configurationId"),
    assignee: strOrNull(p, "assignee"),
    position: num(p, "position"),
    revision: d.revision,
  };
}

type ItemView = ReturnType<typeof itemView>;

// ---- revisions -------------------------------------------------------------------

/** The case's current revision document (`revisions::ensure_current`): the
 *  same id and content the desktop derives, over the case's data with its
 *  stable step ids (an older client's text steps get the ids every device
 *  derives). Stored if the server does not have it yet. */
async function currentRevision(tx: DomainTx, userId: string, kase: RemoteDoc, store: boolean) {
  const p = kase.payload;
  const fields = {
    scenarioId: str(p, "scenarioId"),
    title: str(p, "title"),
    version: str(p, "version"),
    status: str(p, "status"),
    priority: str(p, "priority"),
    caseType: typeof p.caseType === "string" ? p.caseType : null,
    automationStatus: typeof p.automationStatus === "string" ? p.automationStatus : null,
    data: normalizeCaseData(kase.entityId, p.data ?? {}).data,
  };
  const sha = contentSha256(revisionContent(fields));
  const id = revisionId(kase.entityId, kase.revision, sha);
  if (store && !(await tx.get("test_case_revision", id))) {
    await tx.append("test_case_revision", id, {
      id,
      testCaseId: kase.entityId,
      projectId: p.projectId ?? null,
      workspaceId: p.workspaceId ?? null,
      revision: kase.revision,
      ...fields,
      contentSha256: sha,
      createdAt: timestamp(),
      createdBy: userId,
      hlc: kase.hlc,
    });
  }
  return { id, revision: kase.revision, scenarioId: fields.scenarioId, data: obj(fields.data) };
}

/** A stored revision's payload (`manual::revision_data`), or null. */
async function revisionDoc(tx: DomainTx, id: string): Promise<Payload | null> {
  const doc = await tx.get("test_case_revision", id);
  return doc ? doc.payload : null;
}

// ---- results as the run views read them ------------------------------------------

/** What the run screen reads of one project, loaded once per call. */
interface RunData {
  runs: RemoteDoc[];
  items: RemoteDoc[];
  results: RemoteDoc[];
  shards: Map<string, Payload>;
  link: (result: Payload) => ResultLink;
}

/** What the views read: one run's items, results and shards (`runId`), or,
 *  without it, the whole project's (the counts of every run). */
async function loadRunData(tx: DomainTx, projectId: string, runId?: string): Promise<RunData> {
  // One client per transaction: the reads go one after the other.
  // `tx.list` gives live documents: a deleted run (a tombstone) is not here.
  const scoped = runId ? { where: { runId } } : undefined;
  const runs = runId
    ? [await tx.get("run", runId)].filter(isLiveRun)
    : (await tx.list("run", projectId)).filter(isLiveRun);
  const liveRuns = new Set(runs.map((d) => d.entityId));
  const items = await tx.list("run_item", projectId, scoped);
  const results = await tx.list("result", projectId, scoped);
  const shardDocs = (await tx.list("run_shard", projectId, scoped)).filter((d) => liveRuns.has(str(d.payload, "runId")));
  const superseded = supersededShards(shardDocs);
  let resolve: ((r: Payload) => ResultLink) | null = null;
  const imported = results.some((d) => isImported(d.payload));
  if (imported) resolve = await projectLinks(tx, projectId, { run: runs, run_item: items });
  return {
    runs,
    items,
    // A shard superseded by a newer normalizer is not read (`CURRENT_SHARD`).
    // Only results of live runs count (EJE-07: a deleted run's stay stored).
    results: results.filter(
      (d) => liveRuns.has(str(d.payload, "runId")) && !superseded.has(str(d.payload, "shardId")),
    ),
    shards: new Map(shardDocs.map((d) => [d.entityId, d.payload] as const)),
    link: (r) => {
      if (!resolve) throw new Error("no resolver");
      return resolve(r);
    },
  };
}

const attemptOf = (d: RemoteDoc, shards: Map<string, Payload>): ProgressAttempt => {
  const p = d.payload;
  const shard = shards.get(str(p, "shardId"));
  return {
    id: d.entityId,
    runId: str(p, "runId"),
    testKey: str(p, "testKey"),
    configurationLabel: strOrNull(p, "configurationLabel"),
    attempt: num(p, "attempt"),
    status: str(p, "status"),
    startedAt: strOrNull(p, "startedAt"),
    finishedAt: strOrNull(p, "finishedAt"),
    shardImportedAt: shard ? strOrNull(shard, "importedAt") : null,
    hlc: str(p, "hlc"),
  };
};

/** Flaky tests (`derive::flaky_tests`): the final passed and an earlier one
 *  failed, or the tool declared the final flaky. */
function flakyTests(attempts: ProgressAttempt[], declared: Set<string>, finals: Set<string>): Set<string> {
  const test = (a: ProgressAttempt) => JSON.stringify([a.runId, a.testKey, a.configurationLabel ?? ""]);
  const failed = new Map<string, string[]>();
  for (const a of attempts) if (a.status === "failed") failed.set(test(a), [...(failed.get(test(a)) ?? []), a.id]);
  const out = new Set<string>();
  for (const a of attempts) {
    if (!finals.has(a.id) || a.status !== "passed") continue;
    if ((failed.get(test(a)) ?? []).some((id) => id !== a.id) || declared.has(a.id)) out.add(test(a));
  }
  return out;
}

/** Every attempt of a run, oldest first, with the derived final, flaky and
 *  link (`runs::list_results`). An imported result's step ids are not
 *  derived on the server (`resultLink.ts`); its steps show by their text. */
function resultViews(data: RunData, runId: string, cases: Map<string, RemoteDoc>) {
  const docs = data.results
    .filter((d) => str(d.payload, "runId") === runId)
    .sort((a, b) => {
      const [x, y] = [sortable(str(a.payload, "createdAt")), sortable(str(b.payload, "createdAt"))];
      return x < y ? -1 : x > y ? 1 : a.seq - b.seq;
    });
  const attempts = docs.map((d) => attemptOf(d, data.shards));
  const finals = finalAttempts(attempts);
  const declared = new Set(docs.filter((d) => obj(d.payload.attributes).flaky === true).map((d) => d.entityId));
  const flaky = flakyTests(attempts, declared, finals);
  return docs.map((d, i) => {
    const p = d.payload;
    const steps = (Array.isArray(p.steps) ? p.steps : []).map((s, n) => {
      const x = obj(s);
      return {
        id: str(x, "id") || `${d.entityId}:${n}`,
        position: numOrNull(x, "position") ?? n,
        stepId: strOrNull(x, "stepId"),
        keyword: strOrNull(x, "keyword"),
        text: str(x, "text"),
        status: str(x, "status"),
        actual: typeof x.actual === "string" ? x.actual : null,
        durationMs: numOrNull(x, "durationMs"),
        gherkinLine: numOrNull(x, "gherkinLine"),
      };
    });
    const a = attempts[i];
    const imported = isImported(p);
    const link = imported ? data.link(p) : null;
    const caseId = link ? link.caseId : strOrNull(p, "testCaseId");
    const kase = caseId ? cases.get(caseId) : undefined;
    return {
      id: d.entityId,
      runId,
      shardId: strOrNull(p, "shardId"),
      runItemId: strOrNull(p, "runItemId"),
      testKey: str(p, "testKey"),
      testCaseId: strOrNull(p, "testCaseId"),
      effectiveTestCaseId: caseId,
      testCaseRevisionId: strOrNull(p, "testCaseRevisionId"),
      caseRevision: numOrNull(p, "caseRevision"),
      caseKey: strOrNull(p, "caseKey"),
      flowId: strOrNull(p, "flowId"),
      exampleRowId: strOrNull(p, "exampleRowId"),
      exampleRow: numOrNull(p, "exampleRow"),
      configurationLabel: strOrNull(p, "configurationLabel"),
      attempt: num(p, "attempt"),
      status: str(p, "status"),
      rawStatus: strOrNull(p, "rawStatus"),
      durationMs: numOrNull(p, "durationMs"),
      startedAt: strOrNull(p, "startedAt"),
      finishedAt: strOrNull(p, "finishedAt"),
      errorMessage: typeof p.errorMessage === "string" ? p.errorMessage : null,
      executedBy: str(p, "executedBy"),
      attributes: obj(p.attributes),
      createdAt: str(p, "createdAt"),
      isFinal: finals.has(d.entityId),
      flaky: flaky.has(JSON.stringify([a.runId, a.testKey, a.configurationLabel ?? ""])),
      steps,
      effectiveRevisionId: link ? link.revisionId : strOrNull(p, "testCaseRevisionId"),
      effectiveCaseRevision: link ? link.caseRevision : numOrNull(p, "caseRevision"),
      effectiveFlowId: link ? link.flowId : strOrNull(p, "flowId"),
      effectiveExampleRowId: link ? link.exampleRowId : strOrNull(p, "exampleRowId"),
      effectiveRunItemId: link ? link.runItemId : strOrNull(p, "runItemId"),
      effectiveStepIds: link ? steps.map(() => null) : steps.map((s) => s.stepId),
      linkReason: link ? link.reason : null,
      caseDeleted: link ? link.caseDeleted : !!kase?.deleted,
      effectiveConfigurationId: link ? link.configurationId : strOrNull(p, "configurationId"),
    };
  });
}

type ResultView = ReturnType<typeof resultViews>[number];

/** The worst status (`derive::worst_status`): failed > blocked > other >
 *  skipped > passed; the statuses are sorted first, as on the desktop. */
function worst(statuses: string[]): string | null {
  const sev = (s: string) => (s === "failed" ? 4 : s === "blocked" ? 3 : s === "skipped" ? 1 : s === "passed" ? 0 : 2);
  let out: string | null = null;
  for (const s of [...statuses].sort()) if (out === null || sev(s) >= sev(out)) out = s;
  return out;
}

// ---- service ---------------------------------------------------------------------

export function createRunService(store: DomainStore) {
  const run = store.tx.bind(store);
  /** Reads: a read-only transaction, without the user's write lock. */
  const read = store.readTx.bind(store);

  async function liveProject(tx: DomainTx, projectId: string) {
    const doc = await tx.get("project", projectId);
    if (!doc || doc.deleted) throw bad("project not found");
  }

  /** A cycle and a configuration of this project (`cycles::check_run_links`). */
  async function checkRunLinks(tx: DomainTx, projectId: string, cycleId: string | null, configurationId: string | null) {
    if (cycleId) {
      const c = await tx.get("test_cycle", cycleId);
      if (!c || c.deleted || str(c.payload, "projectId") !== projectId) throw bad(`cycle-not-found: ${cycleId}`);
      if (str(c.payload, "status") === "closed") throw conflict("cycle_closed", "cycle-closed");
    }
    if (configurationId) {
      const c = await tx.get("configuration", configurationId);
      if (!c || c.deleted || str(c.payload, "projectId") !== projectId)
        throw bad(`configuration-not-found: ${configurationId}`);
    }
  }

  /** `runs::insert_run`: a new open run with its key. */
  async function insertRun(tx: DomainTx, input: RunInput): Promise<RemoteDoc> {
    const projectId = text(input.projectId);
    if (!projectId) throw bad("projectId is required");
    await liveProject(tx, projectId);
    const title = text(input.title);
    if (!title) throw bad("title is required");
    within("title", title, MAX_TITLE);
    const trigger = text(input.trigger) ?? "manual";
    if (!["manual", "local", "agent", "ci", "cloud", "import"].includes(trigger)) throw bad(`unknown trigger: ${trigger}`);
    await checkRunLinks(tx, projectId, text(input.cycleId), text(input.configurationId));
    const id = randomUUID();
    const n = await tx.nextNumber(projectId, "run", KEY_PREFIX);
    const at = timestamp();
    const payload: Payload = {
      id,
      workspaceId: WORKSPACE,
      projectId,
      runKey: `${KEY_PREFIX}${String(n).padStart(KEY_DIGITS, "0")}`,
      title,
      trigger,
    };
    for (const k of RUN_TEXT) payload[k] = text(input[k]);
    Object.assign(payload, {
      context: obj(input.context),
      status: "in_progress",
      startedAt: text(input.startedAt) ?? instant(),
      finishedAt: null,
      summary: {},
      data: {},
      createdAt: at,
      updatedAt: at,
    });
    return tx.put("run", id, payload, null);
  }

  /** `runs::add_items`: each item freezes its case's current revision. One
   *  folded write per item and one summary event for the run. */
  async function addItems(tx: DomainTx, userId: string, runDoc: RemoteDoc, items: RunItemInput[]) {
    requireOpen(runDoc);
    const projectId = str(runDoc.payload, "projectId");
    // Positions count every item ever added, deleted ones too (`max(position)`
    // over `run_items`, as on the desktop); overlaps only the live ones.
    const all = await tx.list("run_item", projectId, { withDeleted: true, where: { runId: runDoc.entityId } });
    const live = all.filter((d) => !d.deleted);
    let position = Math.max(-1, ...all.map((d) => num(d.payload, "position"))) + 1;
    // Targets of the run's items by case: refused overlaps (S5) also within
    // this call.
    const taken = new Map<string, ExecutionTarget[][]>();
    for (const d of live) {
      const caseId = str(d.payload, "testCaseId");
      const rev = await revisionDoc(tx, str(d.payload, "testCaseRevisionId"));
      const ts = targetsOf(caseId, obj(rev?.data), strOrNull(d.payload, "flowId"), strOrNull(d.payload, "exampleRowId"));
      taken.set(caseId, [...(taken.get(caseId) ?? []), ts]);
    }
    const out: RemoteDoc[] = [];
    for (const item of items) {
      const kase = await tx.get("test_case", item.testCaseId);
      if (!kase || kase.deleted || str(kase.payload, "projectId") !== projectId)
        throw bad(`test case not found: ${item.testCaseId}`);
      const revision = await currentRevision(tx, userId, kase, true);
      const flowId = text(item.flowId);
      const rowId = text(item.exampleRowId);
      const shape = flowShape(revision.data, flowId);
      if (!shape) throw bad(`flow not in the case revision: ${flowId}`);
      if (rowId && !shape.rows.has(rowId)) throw bad(`example row not in that flow of the case revision: ${rowId}`);
      const mine = targetsOf(item.testCaseId, revision.data, flowId, rowId);
      if ((taken.get(item.testCaseId) ?? []).some((other) => overlaps(other, mine)))
        throw conflict("item_overlap", `item-overlap: ${str(kase.payload, "scenarioId") || item.testCaseId}`);
      taken.set(item.testCaseId, [...(taken.get(item.testCaseId) ?? []), mine]);
      const id = randomUUID();
      const at = timestamp();
      out.push(
        await tx.put(
          "run_item",
          id,
          {
            id,
            workspaceId: WORKSPACE,
            projectId,
            runId: runDoc.entityId,
            testCaseId: item.testCaseId,
            testCaseRevisionId: revision.id,
            flowId,
            exampleRowId: rowId,
            exampleRow: item.exampleRow ?? null,
            configurationId: text(item.configurationId),
            assignee: text(item.assignee),
            position: position++,
            createdAt: at,
            updatedAt: at,
          },
          null,
          false,
          { audit: "folded" },
        ),
      );
    }
    if (out.length) await tx.audit("update", "run", runDoc.entityId, { itemsAdded: out.length });
    return out;
  }

  /** `runs::update_run`, and `reopen_run` for `in_progress` on a closed run. */
  async function updateRun(tx: DomainTx, id: string, input: RunInput, revision?: number) {
    const doc = await liveRun(tx, id);
    if (revision !== undefined && doc.revision !== revision) throw staleWrite(doc);
    const p = doc.payload;
    const status = str(p, "status");
    const wanted = text(input.status);
    if (status !== "in_progress" && wanted === "in_progress") {
      // A run of a closed cycle stays closed: reopen the cycle first.
      const cycleId = strOrNull(p, "cycleId");
      if (cycleId) {
        const c = await tx.get("test_cycle", cycleId);
        if (c && !c.deleted && str(c.payload, "status") === "closed") throw conflict("cycle_closed", "cycle-closed");
      }
      return tx.put("run", id, { ...p, status: "in_progress", finishedAt: null, updatedAt: timestamp() }, doc);
    }
    requireOpen(doc);
    // Only a link that changes is checked: a run keeps a cycle purged since.
    const changed = (k: "cycleId" | "configurationId") => {
      const v = text(input[k]);
      return v && v !== strOrNull(p, k) ? v : null;
    };
    await checkRunLinks(tx, str(p, "projectId"), changed("cycleId"), changed("configurationId"));
    const next = wanted ?? status;
    if (!RUN_STATUSES.includes(next)) throw bad(`unknown run status: ${next}`);
    const title = text(input.title);
    if (title) within("title", title, MAX_TITLE);
    const out: Payload = { ...p };
    if (title) out.title = title;
    for (const k of RUN_TEXT) {
      const v = text(input[k]);
      if (v) out[k] = v;
    }
    if (input.context) out.context = obj(input.context);
    const started = text(input.startedAt);
    if (started) out.startedAt = started;
    out.status = next;
    const finished = text(input.finishedAt);
    out.finishedAt = next !== "in_progress" ? (finished ?? strOrNull(p, "finishedAt") ?? instant()) : (finished ?? strOrNull(p, "finishedAt"));
    out.updatedAt = timestamp();
    return tx.put("run", id, out, doc);
  }

  /** `runs::item_context` with its run: a live item of a live run. */
  async function liveItem(tx: DomainTx, runItemId: string) {
    const item = await tx.get("run_item", runItemId);
    if (!item) throw notFound("run item not found");
    // The run first: an item of a deleted run (tombstoned with it or not)
    // says the run is deleted.
    let runDoc: RemoteDoc;
    try {
      runDoc = await liveRun(tx, str(item.payload, "runId"));
    } catch (e) {
      if (e instanceof AppError && e.code === "run_deleted") throw e;
      throw notFound("run item not found");
    }
    if (item.deleted) throw notFound("run item not found");
    return { item, run: runDoc };
  }

  /** `runs::record_result` (+ `manual::record_from_draft`'s idempotency): one
   *  immutable attempt with its steps and one `execute` event. */
  async function record(tx: DomainTx, userId: string, input: ResultInput): Promise<string> {
    const raw = text(input.attemptId);
    if (!raw) throw bad("attempt-id-required");
    const attempt = normalizeAttempt(raw);
    if (!attempt) throw bad(`attempt-id-invalid: ${raw}`);
    const { item, run: runDoc } = await liveItem(tx, input.runItemId);
    const ip = item.payload;
    const itemFlow = strOrNull(ip, "flowId");
    const itemRow = strOrNull(ip, "exampleRowId");
    // A retry of a recorded attempt returns it: same item, same target.
    const stored = await tx.get("result", attempt);
    if (stored) {
      const sp = stored.payload;
      const flow = text(input.flowId) ?? itemFlow;
      const row = text(input.exampleRowId) ?? itemRow;
      if (strOrNull(sp, "runItemId") === input.runItemId && strOrNull(sp, "flowId") === flow && strOrNull(sp, "exampleRowId") === row)
        return attempt;
      throw conflict("attempt_id_taken", "attempt-id-taken");
    }
    requireOpen(runDoc);
    if (!RESULT_STATUSES.includes(input.status)) throw bad(`unknown result status: ${input.status}`);
    const steps = input.steps ?? [];
    if (steps.length > MAX_STEPS) throw bad(`steps-too-many: at most ${MAX_STEPS} steps`);
    const frozenId = str(ip, "testCaseRevisionId");
    const rev = await revisionDoc(tx, frozenId);
    const data = obj(rev?.data);
    const narrowed = narrow(
      data,
      { flowId: itemFlow, exampleRowId: itemRow, exampleRow: numOrNull(ip, "exampleRow") },
      text(input.flowId),
      text(input.exampleRowId),
    );
    if ("error" in narrowed) throw bad(narrowed.error);
    const caseId = str(ip, "testCaseId");
    const key = targetKey(narrowed.flowId, narrowed.exampleRowId);
    if (!targetsOf(caseId, data, itemFlow, itemRow).some((x) => x.key === key)) throw bad(`target-not-in-item: ${key}`);
    const shape = flowShape(data, narrowed.flowId);
    if (!shape) throw bad(`flow not in the case revision: ${narrowed.flowId}`);
    if (narrowed.exampleRowId && !shape.rows.has(narrowed.exampleRowId))
      throw bad(`example row not in that flow of the case revision: ${narrowed.exampleRowId}`);
    for (const s of steps) {
      if (!RESULT_STATUSES.includes(s.status)) throw bad(`unknown step status: ${s.status}`);
      const sid = text(s.stepId);
      if (sid && !shape.steps.has(sid)) throw bad(`step not in that flow of the case revision: ${sid}`);
    }
    const testKey = manualTestKey(caseId, narrowed.flowId, narrowed.exampleRowId);
    within("testKey", testKey, MAX_TEST_KEY);
    const label = text(input.configurationLabel);
    const projectId = str(ip, "projectId");
    const runId = runDoc.entityId;
    // attempt n: the next number of this test in this run (shown only).
    const previous = (await tx.list("result", projectId, { where: { runId, testKey } })).filter(
      (d) => (strOrNull(d.payload, "configurationLabel") ?? "") === (label ?? ""),
    );
    const n = previous.length ? Math.max(...previous.map((d) => num(d.payload, "attempt"))) + 1 : 0;
    const payload: Payload = {
      id: attempt,
      workspaceId: WORKSPACE,
      projectId,
      runId,
      shardId: null,
      runItemId: input.runItemId,
      testKey,
      testCaseId: caseId,
      testCaseRevisionId: frozenId,
      caseRevision: rev ? numOrNull(rev, "revision") : null,
      caseKey: rev ? strOrNull(rev, "scenarioId") : null,
      flowId: narrowed.flowId,
      exampleRowId: narrowed.exampleRowId,
      exampleRow: narrowed.exampleRow,
      exampleValues: narrowed.exampleValues,
      configurationId: strOrNull(ip, "configurationId"),
      configurationLabel: label,
      attempt: n,
      status: input.status,
      rawStatus: text(input.rawStatus),
      durationMs: input.durationMs ?? null,
      startedAt: text(input.startedAt),
      finishedAt: text(input.finishedAt) ?? instant(),
      errorMessage: input.errorMessage ?? null,
      errorTrace: input.errorTrace ?? null,
      executedBy: `user:${userId}`,
      externalId: null,
      attributes: obj(input.attributes),
      createdBy: userId,
      createdAt: timestamp(),
      hlc: tx.stamp(),
      steps: steps.map((s, i) => ({
        id: randomUUID(),
        position: i,
        stepId: text(s.stepId),
        keyword: text(s.keyword),
        text: s.text,
        status: s.status,
        actual: s.actual ?? null,
        durationMs: s.durationMs ?? null,
        gherkinLine: s.gherkinLine ?? null,
      })),
    };
    await tx.append("result", attempt, payload);
    await tx.audit(
      "execute",
      "result",
      attempt,
      { runId, runItemId: input.runItemId, testKey, attempt: n, steps: steps.length },
      { status: [null, input.status] },
    );
    return attempt;
  }

  /** The views of one run's screen (or, without `runId`, of every run of
   *  the project), from data loaded once: only the cases they name are read,
   *  tombstones included. */
  async function viewsOf(tx: DomainTx, projectId: string, runId?: string) {
    const data = await loadRunData(tx, projectId, runId);
    const ids = new Set<string>();
    for (const d of data.items) ids.add(str(d.payload, "testCaseId"));
    for (const d of data.results) if (!isImported(d.payload) && str(d.payload, "testCaseId")) ids.add(str(d.payload, "testCaseId"));
    const cases = new Map<string, RemoteDoc>();
    for (const id of ids) {
      const c = await tx.get("test_case", id);
      if (c) cases.set(id, c);
    }
    return { data, cases };
  }

  /** Key, title and deleted flag of a case, else what its frozen revision
   *  says (`manual::case_facts`). */
  function caseFacts(cases: Map<string, RemoteDoc>, caseId: string, frozen: Payload | null) {
    const c = cases.get(caseId);
    if (c) return { key: strOrNull(c.payload, "scenarioId"), title: str(c.payload, "title"), deleted: c.deleted, current: c.revision };
    return { key: frozen ? strOrNull(frozen, "scenarioId") : null, title: frozen ? str(frozen, "title") : "", deleted: true, current: null };
  }

  /** `manual::overview`. `hasDraft` is the browser's: the client adds it. */
  async function overview(tx: DomainTx, runId: string) {
    const doc = await tx.get("run", runId);
    if (!doc) return null;
    const projectId = str(doc.payload, "projectId");
    const project = await tx.get("project", projectId);
    if (!project || project.deleted) return null;
    // The screen tells a deleted run from one that does not exist (EJE-07).
    if (!isLiveRun(doc)) throw runDeleted();
    const { data, cases } = await viewsOf(tx, projectId, runId);
    const p = doc.payload;
    const cycle = strOrNull(p, "cycleId") ? await tx.get("test_cycle", str(p, "cycleId")) : null;
    const configuration = strOrNull(p, "configurationId") ? await tx.get("configuration", str(p, "configurationId")) : null;
    const results = resultViews(data, runId, cases);
    const finals = new Map<string, string[]>();
    const attempts = new Map<string, number>();
    for (const r of results) {
      const item = r.effectiveRunItemId;
      if (!item) continue;
      attempts.set(item, (attempts.get(item) ?? 0) + 1);
      if (r.isFinal) {
        const k = JSON.stringify([item, targetKey(r.effectiveFlowId, r.effectiveExampleRowId)]);
        finals.set(k, [...(finals.get(k) ?? []), r.status]);
      }
    }
    const counts = { passed: 0, failed: 0, blocked: 0, skipped: 0, other: 0, notRun: 0, total: 0 };
    const items = [];
    for (const d of data.items.filter((x) => str(x.payload, "runId") === runId).sort(byPosition)) {
      const item = itemView(d);
      const frozen = await revisionDoc(tx, item.testCaseRevisionId);
      const rd = obj(frozen?.data);
      const facts = caseFacts(cases, item.testCaseId, frozen);
      const targets = targetsOf(item.testCaseId, rd, item.flowId, item.exampleRowId);
      const statuses: string[] = [];
      for (const x of targets) {
        const s = worst(finals.get(JSON.stringify([item.id, x.key])) ?? []);
        if (s) {
          statuses.push(s);
          if (s === "passed" || s === "failed" || s === "blocked" || s === "skipped") counts[s]++;
          else counts.other++;
        } else counts.notRun++;
        counts.total++;
      }
      const flow = item.flowId ? (Array.isArray(rd.flows) ? rd.flows : []).map(obj).find((f) => f.id === item.flowId) : undefined;
      items.push({
        item,
        caseKey: facts.key,
        caseTitle: facts.title,
        caseDeleted: facts.deleted,
        flowName: flow && typeof flow.name === "string" ? flow.name : null,
        rowIndex: item.exampleRowId ? (rowOf(rd, item.flowId, item.exampleRowId)?.index ?? null) : null,
        targets: targets.length,
        done: statuses.length,
        status: worst(statuses) ?? NOT_RUN,
        attempts: attempts.get(item.id) ?? 0,
        hasDraft: false,
      });
    }
    return {
      run: runView(doc),
      cycleKey: cycle ? strOrNull(cycle.payload, "cycleKey") : null,
      cycleTitle: cycle ? strOrNull(cycle.payload, "title") : null,
      configurationName: configuration ? strOrNull(configuration.payload, "name") : null,
      items,
      counts,
    };
  }

  /** `manual::item_detail`, without files (desktop only) and draft (the
   *  browser's). */
  async function itemDetail(tx: DomainTx, userId: string, runItemId: string) {
    const d = await tx.get("run_item", runItemId);
    if (!d || d.deleted) return null;
    const runDoc = await tx.get("run", str(d.payload, "runId"));
    if (!isLiveRun(runDoc)) return null;
    const projectId = str(runDoc.payload, "projectId");
    const project = await tx.get("project", projectId);
    if (!project || project.deleted) return null;
    const item = itemView(d);
    const { data, cases } = await viewsOf(tx, projectId, item.runId);
    const frozen = await revisionDoc(tx, item.testCaseRevisionId);
    const revision = obj(frozen?.data);
    const facts = caseFacts(cases, item.testCaseId, frozen);
    const kase = cases.get(item.testCaseId);
    const current = kase && !kase.deleted ? await currentRevision(tx, userId, kase, false) : null;
    return {
      item,
      runStatus: runView(runDoc).status,
      caseKey: facts.key,
      caseTitle: facts.title,
      caseDeleted: facts.deleted,
      frozenRevision: frozen ? numOrNull(frozen, "revision") : null,
      currentRevision: facts.current,
      caseChanged: current ? current.id !== item.testCaseRevisionId : false,
      revision,
      targets: targetsOf(item.testCaseId, revision, item.flowId, item.exampleRowId),
      results: resultViews(data, item.runId, cases).filter((r) => r.effectiveRunItemId === runItemId),
      attachments: [],
      draft: null,
    };
  }

  /** `cycles::execute`: one run per live configuration of the cycle, each
   *  freezing the current revisions; all or nothing. */
  async function execute(tx: DomainTx, userId: string, cycleId: string, input: ExecuteInput) {
    const cycle = await tx.get("test_cycle", cycleId);
    if (!cycle || cycle.deleted) throw notFound("Cycle not found.");
    const cp = cycle.payload;
    if (str(cp, "status") === "closed") throw conflict("cycle_closed", "cycle-closed");
    const projectId = str(cp, "projectId");
    await liveProject(tx, projectId);
    const items = (await tx.list("test_cycle_item", projectId)).filter((d) => str(d.payload, "cycleId") === cycleId).sort(byPosition);
    if (!items.length) throw bad("cycle-empty");
    for (const it of items) {
      const kase = await tx.get("test_case", str(it.payload, "testCaseId"));
      if (!kase || str(kase.payload, "projectId") !== projectId) throw bad(`cycle-item-case-gone: ${str(it.payload, "testCaseId")}`);
      const key = str(kase.payload, "scenarioId");
      if (kase.deleted) throw bad(`cycle-item-case-gone: ${key}`);
      const shape = flowShape(obj(normalizeCaseData(kase.entityId, kase.payload.data ?? {}).data), strOrNull(it.payload, "flowId"));
      if (!shape) throw bad(`cycle-item-flow-gone: ${key}`);
      const row = strOrNull(it.payload, "exampleRowId");
      if (row && !shape.rows.has(row)) throw bad(`cycle-item-row-gone: ${key}`);
    }
    const ids = Array.isArray(cp.configurationIds) ? cp.configurationIds.filter((x): x is string => typeof x === "string") : [];
    let wanted = ids;
    if (input.configurationIds) {
      wanted = [];
      for (const id of input.configurationIds) {
        if (!ids.includes(id)) throw bad(`configuration not in the cycle: ${id}`);
        if (!wanted.includes(id)) wanted.push(id);
      }
      if (!wanted.length && ids.length) throw bad("no-configuration-chosen");
    }
    const missing: string[] = [];
    const targets: (RemoteDoc | null)[] = [];
    if (!ids.length) targets.push(null);
    else {
      for (const id of wanted) {
        const c = await tx.get("configuration", id);
        if (!c || c.deleted || str(c.payload, "projectId") !== projectId) missing.push(id);
        else if (typeof c.payload.archivedAt !== "string") targets.push(c);
      }
      if (!targets.length)
        throw bad(
          missing.length
            ? "configuration-missing: the cycle's configurations are not on this device yet"
            : "no-configuration: every configuration of the cycle is archived",
        );
    }
    const base = text(input.title) ?? str(cp, "title");
    const runs = [];
    for (const c of targets) {
      let title = `${str(cp, "cycleKey")} · ${base}`;
      if (c) title = `${title} · ${str(c.payload, "name")}`;
      if (title.length > MAX_TITLE) title = [...title].slice(0, MAX_TITLE / 2).join("");
      const runDoc = await insertRun(tx, {
        projectId,
        title,
        trigger: "manual",
        testPlanId: strOrNull(cp, "testPlanId"),
        cycleId,
        configurationId: c?.entityId ?? null,
        environment: text(input.environment) ?? strOrNull(cp, "environment"),
        build: text(input.build) ?? strOrNull(cp, "build"),
      });
      await addItems(
        tx,
        userId,
        runDoc,
        items.map((i) => ({
          testCaseId: str(i.payload, "testCaseId"),
          flowId: strOrNull(i.payload, "flowId"),
          exampleRowId: strOrNull(i.payload, "exampleRowId"),
          exampleRow: null,
          configurationId: c?.entityId ?? null,
          assignee: strOrNull(i.payload, "assignee"),
        })),
      );
      runs.push(runView(runDoc));
    }
    const summary = { runsCreated: runs.length };
    if (str(cp, "status") === "planned")
      await tx.put("test_cycle", cycleId, { ...cp, status: "active", updatedAt: timestamp() }, cycle, false, { summary });
    else await tx.audit("update", "test_cycle", cycleId, summary);
    return { runs, missingConfigurations: missing };
  }

  /** `defects::draft_from_result`, without its evidence (desktop only). */
  async function defectDraft(tx: DomainTx, userId: string, resultId: string, stepId: string | null) {
    const result = await tx.get("result", resultId);
    if (!result || result.deleted) throw notFound("result not found");
    const p = result.payload;
    const projectId = str(p, "projectId");
    const project = await tx.get("project", projectId);
    if (!project || project.deleted) throw notFound("result not found");
    let linkedRevision = strOrNull(p, "testCaseRevisionId");
    let flowId = strOrNull(p, "flowId");
    if (isImported(p)) {
      const link = (await projectLinks(tx, projectId))(p);
      linkedRevision = link.revisionId;
      flowId = link.flowId;
    }
    // A result of a deleted run drafts nothing (EJE-07).
    const runDoc = await liveRun(tx, str(p, "runId"));
    const rev = linkedRevision ? await revisionDoc(tx, linkedRevision) : null;
    const data = obj(rev?.data);
    const list = (v: unknown) =>
      (Array.isArray(v) ? v : []).map((el) => ({
        id: typeof obj(el).id === "string" ? (obj(el).id as string) : null,
        text: stepText(el as never),
        expected: typeof obj(el).expected === "string" && obj(el).expected ? (obj(el).expected as string) : null,
      }));
    const flow = flowId ? (Array.isArray(data.flows) ? data.flows : []).map(obj).find((f) => f.id === flowId) : undefined;
    const steps = flow
      ? [...list(data.background), ...list(flow.preconditions), ...list(flow.steps)]
      : [...list(data.preconditions), ...list(data.background), ...list(data.steps)];
    const numbered = steps.map((s, i) => `${i + 1}. ${s.text}`).join("\n");
    const resultSteps = (Array.isArray(p.steps) ? p.steps : []).map(obj).sort((a, b) => num(a, "position") - num(b, "position"));
    const stepRow = resultSteps.find((s) =>
      stepId === null ? !["passed", "skipped"].includes(str(s, "status")) : strOrNull(s, "stepId") === stepId,
    );
    const sid = stepRow ? strOrNull(stepRow, "stepId") : null;
    const expected = sid ? (steps.find((s) => s.id === sid)?.expected ?? null) : null;
    const actual =
      (stepRow && typeof stepRow.actual === "string" && stepRow.actual.trim() ? stepRow.actual : null) ??
      (typeof p.errorMessage === "string" ? p.errorMessage : null);
    const label = strOrNull(p, "caseKey") ?? str(p, "testKey");
    const what = (stepRow ? str(stepRow, "text") : null) ?? (rev ? str(rev, "title") : "");
    let title = what ? `${label} · ${what}` : label;
    if (title.length > MAX_TITLE) title = [...title].slice(0, MAX_TITLE / 2).join("");
    return {
      projectId,
      userId,
      title,
      stepsToReproduce: numbered,
      expected,
      actual,
      foundInRunId: str(p, "runId"),
      foundInBuild: runDoc ? strOrNull(runDoc.payload, "build") : null,
      foundInEnvironment: runDoc ? strOrNull(runDoc.payload, "environment") : null,
      fromResult: { resultId, stepId: sid ?? stepId },
    };
  }

  return {
    list: (userId: string, projectId: string) =>
      read(userId, async (tx) => {
        const project = await tx.get("project", projectId);
        if (!project || project.deleted) return [];
        return (await tx.list("run", projectId)).filter(isLiveRun).sort(byCreatedDesc).map(runView);
      }),
    /** `run_counts_list`: finals of every live run by status, and how many
     *  of them have no case. */
    counts: (userId: string, projectId: string) =>
      read(userId, async (tx) => {
        const project = await tx.get("project", projectId);
        if (!project || project.deleted) return [];
        const { data, cases } = await viewsOf(tx, projectId);
        const out = [];
        for (const r of data.runs.sort((a, b) => (a.entityId < b.entityId ? -1 : 1))) {
          const finals = resultViews(data, r.entityId, cases).filter((v) => v.isFinal);
          if (!finals.length) continue;
          const c = { runId: r.entityId, passed: 0, failed: 0, other: 0, unlinked: 0 };
          for (const v of finals) {
            if (v.status === "passed") c.passed++;
            else if (v.status === "failed") c.failed++;
            else c.other++;
            if (!v.effectiveTestCaseId) c.unlinked++;
          }
          out.push(c);
        }
        return out;
      }),
    get: (userId: string, id: string) =>
      read(userId, async (tx) => {
        const doc = await tx.get("run", id);
        return isLiveRun(doc) ? runView(doc) : null;
      }),
    results: (userId: string, runId: string): Promise<ResultView[]> =>
      read(userId, async (tx) => {
        const doc = await tx.get("run", runId);
        if (!isLiveRun(doc)) return [];
        const { data, cases } = await viewsOf(tx, str(doc.payload, "projectId"), runId);
        return resultViews(data, runId, cases);
      }),
    overview: (userId: string, runId: string) => read(userId, (tx) => overview(tx, runId)),
    itemDetail: (userId: string, runItemId: string) => read(userId, (tx) => itemDetail(tx, userId, runItemId)),
    /** «Nuevo run manual» (`run_create_manual`): the run and its items in
     *  one transaction, so a refused case leaves no empty run. */
    createManual: (userId: string, input: RunInput, items: RunItemInput[]) =>
      run(userId, async (tx) => {
        const doc = await insertRun(tx, { ...input, trigger: "manual" });
        if (items.length) await addItems(tx, userId, doc, items);
        return runView((await tx.get("run", doc.entityId)) ?? doc);
      }),
    addItems: (userId: string, runId: string, items: RunItemInput[]) =>
      run(userId, async (tx) => (await addItems(tx, userId, await liveRun(tx, runId), items)).map(itemView)),
    update: (userId: string, id: string, input: RunInput, revision?: number) =>
      run(userId, async (tx) => runView(await updateRun(tx, id, input, revision))),
    close: (userId: string, id: string, status: string, revision?: number) =>
      run(userId, async (tx) => {
        if (!["completed", "aborted"].includes(status)) throw bad(`unknown closing status: ${status}`);
        return runView(await updateRun(tx, id, { status }, revision));
      }),
    record: (userId: string, input: ResultInput) => run(userId, (tx) => record(tx, userId, input)),
    execute: (userId: string, cycleId: string, input: ExecuteInput) => run(userId, (tx) => execute(tx, userId, cycleId, input)),
    defectDraft: (userId: string, resultId: string, stepId: string | null) =>
      read(userId, (tx) => defectDraft(tx, userId, resultId, stepId)),
  };
}

const byPosition = (a: RemoteDoc, b: RemoteDoc) =>
  num(a.payload, "position") - num(b.payload, "position") || (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0);

export type RunService = ReturnType<typeof createRunService>;
export type { ItemView };

// ---- routes ----------------------------------------------------------------------

const projectQuery = z.object({ projectId: z.string().min(1).max(200) });
const revisionBody = z.number().int().nonnegative().optional();

/** `/api/runs`, `/api/run-items`, `/api/results` and «Ejecutar» of a cycle
 *  (EJE-06): the web's side of manual execution. */
export function runRoutes(app: FastifyInstance, deps: { runs: RunService; tokens: TokenService }) {
  const { runs } = deps;
  const preHandler = [makeRequireAuth(deps.tokens), requireSupportedVersion];
  const user = (req: FastifyRequest) => req.userId as string;
  const id = (req: FastifyRequest) => (req.params as { id: string }).id;

  app.get("/api/runs", { preHandler }, (req) => runs.list(user(req), projectQuery.parse(req.query).projectId));
  app.get("/api/runs/counts", { preHandler }, (req) => runs.counts(user(req), projectQuery.parse(req.query).projectId));
  app.post("/api/runs", { preHandler }, (req) => {
    const b = z.object({ input: runInputSchema, items: z.array(runItemInputSchema).max(5000).optional() }).parse(req.body);
    return runs.createManual(user(req), b.input, b.items ?? []);
  });
  app.get("/api/runs/:id", { preHandler }, (req) => runs.get(user(req), id(req)));
  app.put("/api/runs/:id", { preHandler }, (req) => {
    const b = z.object({ input: runInputSchema, revision: revisionBody }).parse(req.body);
    return runs.update(user(req), id(req), b.input, b.revision);
  });
  app.post("/api/runs/:id/close", { preHandler }, (req) => {
    const b = z.object({ status: z.string().max(50), revision: revisionBody }).parse(req.body);
    return runs.close(user(req), id(req), b.status, b.revision);
  });
  app.post("/api/runs/:id/items", { preHandler }, (req) =>
    runs.addItems(user(req), id(req), z.object({ items: z.array(runItemInputSchema).max(5000) }).parse(req.body).items),
  );
  app.get("/api/runs/:id/overview", { preHandler }, (req) => runs.overview(user(req), id(req)));
  app.get("/api/runs/:id/results", { preHandler }, (req) => runs.results(user(req), id(req)));
  app.get("/api/run-items/:id", { preHandler }, (req) => runs.itemDetail(user(req), id(req)));
  app.post("/api/results", { preHandler }, async (req) => ({
    id: await runs.record(user(req), z.object({ input: resultInputSchema }).parse(req.body).input),
  }));
  app.get("/api/results/:id/defect-draft", { preHandler }, (req) => {
    const q = z.object({ stepId: z.string().max(200).optional() }).parse(req.query);
    return runs.defectDraft(user(req), id(req), q.stepId?.trim() || null);
  });
  app.post("/api/cycles/:id/execute", { preHandler }, (req) =>
    runs.execute(user(req), id(req), executeInputSchema.parse(req.body ?? {})),
  );
}
