import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../auth/errors";
import { makeRequireAuth } from "../auth/middleware";
import type { TokenService } from "../auth/tokens";
import type { RemoteDoc } from "../sync/sync.repository";
import { requireSupportedVersion } from "../sync/sync.version";
import { cells, count, emptySummary, type ProgressAttempt, type ProgressSummary } from "./cycle-progress";
import { staleWrite, type DomainStore, type DomainTx } from "./domain.store";
import { sortable, timestamp } from "./domain.service";

// Test cycles and configurations on the web (CYC-01, ADR-0017): the rules of
// the desktop's `cycles.rs` applied to the server's document store, with the
// same payloads, so either side edits what the other wrote. «Ejecutar» (one
// run per configuration, freezing the current revisions) stays on the
// desktop until runs have a web API; the web reads the runs and their
// results to show progress, with the same derivation (`cycle-progress.ts`).

type Payload = Record<string, unknown>;

const WORKSPACE = "local";
const KEY_PREFIX = "CYC-";
const KEY_DIGITS = 3;
const STATUSES = ["planned", "active", "closed"] as const;
const ATTRIBUTES = ["browser", "os", "device", "locale"] as const;

const now = () => timestamp();
const str = (p: Payload, key: string) => (typeof p[key] === "string" ? (p[key] as string) : "");
const strOrNull = (p: Payload, key: string) => (typeof p[key] === "string" ? (p[key] as string) : null);
const num = (p: Payload, key: string) => (typeof p[key] === "number" ? (p[key] as number) : 0);
const list = (p: Payload, key: string) =>
  Array.isArray(p[key]) ? (p[key] as unknown[]).filter((x): x is string => typeof x === "string") : [];
const notFound = (what: string) => new AppError(404, "not_found", `${what} not found.`);
const bad = (code: string, message: string) => new AppError(400, code, message);
const normalize = (label: string) => label.trim().toLowerCase();
const utf16 = (s: string) => s.length;

// ---- inputs ----------------------------------------------------------------------

const text = (max: number) => z.string().max(max);
const optText = z.string().max(200).nullish();

export const configurationInputSchema = z.object({
  projectId: text(200).optional(),
  name: text(200).optional(),
  attributes: z.record(z.string(), z.string().max(200).nullable()).optional(),
  matchLabels: z.array(text(200)).max(500).optional(),
});

export const cycleInputSchema = z.object({
  projectId: text(200).optional(),
  title: text(500).optional(),
  description: text(10_000).optional(),
  testPlanId: optText,
  milestone: optText,
  sprint: optText,
  build: optText,
  environment: optText,
  configurationIds: z.array(text(200)).max(500).optional(),
  startsOn: optText,
  endsOn: optText,
  status: text(50).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const itemInputSchema = z.object({
  testCaseId: text(200).min(1),
  flowId: optText,
  exampleRowId: optText,
  assignee: optText,
});

export const filterSchema = z.object({
  tags: z.array(text(200)).max(200).optional(),
  requirementKeys: z.array(text(200)).max(500).optional(),
  priorities: z.array(text(50)).max(10).optional(),
  statuses: z.array(text(50)).max(10).optional(),
  minRisk: z.number().int().min(1).max(25).nullish(),
});

export type ConfigurationInput = z.infer<typeof configurationInputSchema>;
export type CycleInput = z.infer<typeof cycleInputSchema>;
export type ItemInput = z.infer<typeof itemInputSchema>;
export type CycleFilter = z.infer<typeof filterSchema>;

// ---- helpers ----------------------------------------------------------------------

function live(doc: RemoteDoc | null, what: string, revision?: number): RemoteDoc {
  if (!doc || doc.deleted) throw notFound(what);
  if (revision !== undefined && doc.revision !== revision) throw staleWrite(doc);
  return doc;
}

async function liveProject(tx: DomainTx, projectId: string) {
  const doc = await tx.get("project", projectId);
  if (!doc || doc.deleted) throw notFound("Project");
}

const validDay = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

function checkAttributes(attrs: Record<string, string | null>): Payload {
  const out: Payload = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (!(ATTRIBUTES as readonly string[]).includes(k)) throw bad("invalid_configuration", `Unknown attribute: ${k}.`);
    const t = v?.trim();
    if (t) out[k] = t;
  }
  return out;
}

function checkLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of labels) {
    const t = l.trim();
    if (!t || seen.has(normalize(t))) continue;
    seen.add(normalize(t));
    out.push(t);
  }
  if (out.length > 50) throw bad("invalid_configuration", "At most 50 match labels.");
  return out;
}

const isArchived = (p: Payload) => typeof p.archivedAt === "string";

async function projectConfigurations(tx: DomainTx, projectId: string) {
  const docs = (await tx.list("configuration", projectId)).sort(
    (a, b) => num(a.payload, "position") - num(b.payload, "position") || a.seq - b.seq,
  );
  // Labels shared by live, not archived configurations (two devices offline):
  // the smallest id wins, as on the desktop.
  const holders = new Map<string, { id: string; name: string }[]>();
  for (const d of docs.filter((d) => !isArchived(d.payload)))
    for (const l of list(d.payload, "matchLabels")) {
      const k = normalize(l);
      holders.set(k, [...(holders.get(k) ?? []), { id: d.entityId, name: str(d.payload, "name") }]);
    }
  return docs.map((d) => {
    const p = d.payload;
    const labelClashes = isArchived(p)
      ? []
      : list(p, "matchLabels").flatMap((label) => {
          const hs = holders.get(normalize(label)) ?? [];
          if (hs.length < 2) return [];
          const winner = hs.map((h) => h.id).sort()[0];
          return hs
            .filter((h) => h.id !== d.entityId)
            .map((h) => ({ label, otherId: h.id, otherName: h.name, wins: winner === d.entityId }));
        });
    return {
      doc: d,
      view: {
        id: d.entityId,
        projectId: str(p, "projectId"),
        name: str(p, "name"),
        attributes: (p.attributes as Payload) ?? {},
        matchLabels: list(p, "matchLabels"),
        position: num(p, "position"),
        archived: isArchived(p),
        revision: d.revision,
        labelClashes,
      },
    };
  });
}

async function checkLabelsFree(tx: DomainTx, projectId: string, labels: string[], except?: string) {
  const taken = new Map<string, string>();
  for (const { view } of await projectConfigurations(tx, projectId)) {
    if (view.archived || view.id === except) continue;
    for (const l of view.matchLabels) taken.set(normalize(l), view.name);
  }
  for (const l of labels) {
    const name = taken.get(normalize(l));
    if (name) throw new AppError(409, "match_label_taken", `match-label-taken: ${l} (${name})`);
  }
}

const cycleView = (d: RemoteDoc) => {
  const p = d.payload;
  return {
    id: d.entityId,
    projectId: str(p, "projectId"),
    cycleKey: str(p, "cycleKey"),
    title: str(p, "title"),
    description: str(p, "description"),
    testPlanId: strOrNull(p, "testPlanId"),
    milestone: strOrNull(p, "milestone"),
    sprint: strOrNull(p, "sprint"),
    build: strOrNull(p, "build"),
    environment: strOrNull(p, "environment"),
    configurationIds: list(p, "configurationIds"),
    startsOn: strOrNull(p, "startsOn"),
    endsOn: strOrNull(p, "endsOn"),
    status: str(p, "status") || "planned",
    data: (p.data as Payload) ?? {},
    createdAt: str(p, "createdAt"),
    updatedAt: str(p, "updatedAt"),
    revision: d.revision,
  };
};

/** By position, then id: the desktop's order, the same on every device. */
const byId = (a: RemoteDoc, b: RemoteDoc) => (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0);
const byPosition = (a: RemoteDoc, b: RemoteDoc) => num(a.payload, "position") - num(b.payload, "position") || byId(a, b);

async function liveItems(tx: DomainTx, cycle: RemoteDoc) {
  return (await tx.list("test_cycle_item", str(cycle.payload, "projectId")))
    .filter((d) => str(d.payload, "cycleId") === cycle.entityId)
    .sort(byPosition);
}

/** The shape of the current case a cycle item may point at: the flows and the
 *  Outline rows of each (`runs::RevisionShape`). */
function rowsOf(data: Payload, flowId: string | null): Set<string> | null {
  const ids = (v: unknown) =>
    new Set(
      (Array.isArray(v) ? v : [])
        .map((x) => (x && typeof x === "object" ? (x as Payload).id : undefined))
        .filter((x): x is string => typeof x === "string"),
    );
  const rows = (v: Payload) => ids((v.examples as Payload | undefined)?.rows);
  if (!flowId) return rows(data);
  const flow = (Array.isArray(data.flows) ? data.flows : []).find(
    (f): f is Payload => !!f && typeof f === "object" && (f as Payload).id === flowId,
  );
  return flow ? rows(flow) : null;
}

/** What progress reads of the project, loaded once for every cycle in it
 *  (the list shows them all): live items, runs, shards, unlinked mappings and
 *  results, grouped by cycle. */
interface ExecutionData {
  items: Map<string, RemoteDoc[]>;
  runs: Map<string, number>;
  attempts: Map<string, ProgressAttempt[]>;
}

/** The progress view of one result: what places it in a cell. The one place
 *  that reads a result for progress (step 9 moves the case/revision link out
 *  of the result content; only this function changes then). */
function attemptOf(
  d: RemoteDoc,
  run: Payload,
  shard: Payload | undefined,
  mappings: Map<string, string | null>,
): ProgressAttempt {
  const p = d.payload;
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
    configurationId: strOrNull(run, "configurationId") ?? strOrNull(p, "configurationId"),
    caseId: strOrNull(p, "testCaseId") ?? mappings.get(str(p, "testKey")) ?? null,
    flowId: strOrNull(p, "flowId"),
    rowId: strOrNull(p, "exampleRowId"),
  };
}

async function loadExecution(tx: DomainTx, projectId: string): Promise<ExecutionData> {
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => m.set(k, [...(m.get(k) ?? []), v]);
  const items = new Map<string, RemoteDoc[]>();
  for (const d of await tx.list("test_cycle_item", projectId)) push(items, str(d.payload, "cycleId"), d);
  for (const list of items.values()) list.sort(byPosition);
  const runCycle = new Map<string, { cycle: string; payload: Payload }>();
  const runs = new Map<string, number>();
  for (const d of await tx.list("run", projectId)) {
    const cycle = str(d.payload, "cycleId");
    if (!cycle) continue;
    runCycle.set(d.entityId, { cycle, payload: d.payload });
    runs.set(cycle, (runs.get(cycle) ?? 0) + 1);
  }
  const shards = new Map((await tx.list("run_shard", projectId)).map((d) => [d.entityId, d.payload] as const));
  const mappings = new Map<string, string | null>();
  for (const d of (await tx.list("unlinked_mapping", projectId)).sort((a, b) => a.seq - b.seq))
    mappings.set(str(d.payload, "testKey"), strOrNull(d.payload, "testCaseId"));
  const attempts = new Map<string, ProgressAttempt[]>();
  for (const d of await tx.list("result", projectId)) {
    const run = runCycle.get(str(d.payload, "runId"));
    if (!run) continue;
    push(attempts, run.cycle, attemptOf(d, run.payload, shards.get(str(d.payload, "shardId")), mappings));
  }
  return { items, runs, attempts };
}

/** Progress of one cycle (the desktop's `cycle_progress_of`). */
function progressOf(cycle: RemoteDoc, data: ExecutionData) {
  const items = data.items.get(cycle.entityId) ?? [];
  const configs = list(cycle.payload, "configurationIds");
  const columns: (string | null)[] = configs.length ? configs : [null];
  const result = cells(
    items.map((i) => ({
      id: i.entityId,
      caseId: str(i.payload, "testCaseId"),
      flowId: strOrNull(i.payload, "flowId"),
      rowId: strOrNull(i.payload, "exampleRowId"),
    })),
    columns,
    data.attempts.get(cycle.entityId) ?? [],
  );
  const summary = emptySummary();
  const byConfiguration = columns.map((configurationId) => ({ configurationId, summary: emptySummary() }));
  for (const c of result) {
    count(summary, c.status);
    const col = byConfiguration.find((b) => b.configurationId === c.configurationId);
    if (col) count(col.summary, c.status);
  }
  return {
    configurationIds: columns,
    cells: result,
    byConfiguration,
    summary,
    runs: data.runs.get(cycle.entityId) ?? 0,
    items: items.length,
  };
}

// ---- service ------------------------------------------------------------------------

export function createCycleService(store: DomainStore) {
  const run = store.tx.bind(store);

  async function liveCycle(tx: DomainTx, id: string, revision?: number) {
    return live(await tx.get("test_cycle", id), "Cycle", revision);
  }

  function requireOpen(cycle: RemoteDoc) {
    if (str(cycle.payload, "status") === "closed") throw new AppError(409, "cycle_closed", "cycle-closed");
  }

  async function checkConfigurationIds(tx: DomainTx, projectId: string, ids: string[], keep: string[]) {
    const configs = await projectConfigurations(tx, projectId);
    const out: string[] = [];
    for (const raw of ids) {
      const id = raw.trim();
      if (!id || out.includes(id)) continue;
      const c = configs.find((x) => x.view.id === id);
      if (!c) throw bad("invalid_cycle", `configuration-not-found: ${id}`);
      if (c.view.archived && !keep.includes(id)) throw bad("invalid_cycle", `configuration-archived: ${c.view.name}`);
      out.push(id);
    }
    if (out.length > 200) throw bad("invalid_cycle", "At most 200 configurations.");
    return out;
  }

  /** The header of an input over `prev`: a key left out keeps its value, an
   *  empty text clears it. */
  async function header(tx: DomainTx, projectId: string, prev: Payload, input: CycleInput): Promise<Payload> {
    const next: Payload = { ...prev };
    for (const k of ["milestone", "sprint", "build", "environment", "testPlanId", "startsOn", "endsOn"] as const) {
      if (input[k] === undefined) continue;
      next[k] = input[k]?.trim() || null;
    }
    if (input.description !== undefined) next.description = input.description.trim();
    if (input.title !== undefined) {
      const t = input.title.trim();
      if (!t) throw bad("invalid_cycle", "title is required");
      next.title = t;
    }
    if (input.status !== undefined) {
      if (!(STATUSES as readonly string[]).includes(input.status)) throw bad("invalid_cycle", `unknown cycle status: ${input.status}`);
      next.status = input.status;
    }
    if (input.data !== undefined) next.data = input.data;
    for (const k of ["startsOn", "endsOn"]) {
      const v = next[k];
      if (typeof v === "string" && !validDay(v)) throw bad("invalid_cycle", `invalid ${k}: ${v} (YYYY-MM-DD)`);
    }
    if (typeof next.startsOn === "string" && typeof next.endsOn === "string" && next.startsOn > next.endsOn)
      throw bad("invalid_cycle", "dates-out-of-order: the cycle ends before it starts");
    if (typeof next.testPlanId === "string" && next.testPlanId !== prev.testPlanId) {
      const plan = await tx.get("test_plan", next.testPlanId);
      if (!plan || plan.deleted || str(plan.payload, "projectId") !== projectId)
        throw bad("invalid_cycle", `test plan not found: ${next.testPlanId}`);
    }
    if (input.configurationIds !== undefined)
      next.configurationIds = await checkConfigurationIds(tx, projectId, input.configurationIds, list(prev, "configurationIds"));
    return next;
  }

  async function addItems(tx: DomainTx, cycle: RemoteDoc, items: ItemInput[]) {
    requireOpen(cycle);
    const projectId = str(cycle.payload, "projectId");
    const existing = await liveItems(tx, cycle);
    const present: [string, string | null, string | null][] = existing.map((i) => [
      str(i.payload, "testCaseId"),
      strOrNull(i.payload, "flowId"),
      strOrNull(i.payload, "exampleRowId"),
    ]);
    // Two items of one case cover a common test when their flows and rows
    // meet (one of each is empty, or they are equal): `cycles.rs::overlaps`.
    const meet = (x: string | null, y: string | null) => x === null || y === null || x === y;
    let position = Math.max(-1, ...existing.map((i) => num(i.payload, "position"))) + 1;
    const out = { added: [] as string[], skipped: 0, overlapping: [] as string[], notApproved: [] as string[] };
    for (const item of items) {
      const kase = await tx.get("test_case", item.testCaseId);
      if (!kase || kase.deleted || str(kase.payload, "projectId") !== projectId)
        throw bad("invalid_cycle_item", `test case not found: ${item.testCaseId}`);
      const flowId = item.flowId?.trim() || null;
      const rowId = item.exampleRowId?.trim() || null;
      const rows = rowsOf((kase.payload.data as Payload) ?? {}, flowId);
      if (!rows) throw bad("invalid_cycle_item", `flow not in the case revision: ${flowId}`);
      if (rowId && !rows.has(rowId)) throw bad("invalid_cycle_item", `example row not in that flow of the case: ${rowId}`);
      const key = str(kase.payload, "scenarioId");
      if (present.some((p) => p[0] === item.testCaseId && p[1] === flowId && p[2] === rowId)) {
        out.skipped++;
        continue;
      }
      if (present.some((p) => p[0] === item.testCaseId && meet(p[1], flowId) && meet(p[2], rowId))) {
        if (!out.overlapping.includes(key)) out.overlapping.push(key);
        continue;
      }
      present.push([item.testCaseId, flowId, rowId]);
      const id = randomUUID();
      const at = now();
      await tx.put(
        "test_cycle_item",
        id,
        {
          id,
          workspaceId: WORKSPACE,
          projectId,
          cycleId: cycle.entityId,
          testCaseId: item.testCaseId,
          flowId,
          exampleRowId: rowId,
          assignee: item.assignee?.trim() || null,
          position: position++,
          createdAt: at,
          updatedAt: at,
        },
        null,
        false,
        { audit: "folded" },
      );
      if (str(kase.payload, "status") !== "approved" && !out.notApproved.includes(key)) out.notApproved.push(key);
      out.added.push(id);
    }
    if (out.added.length) await tx.audit("update", "test_cycle", cycle.entityId, { itemsAdded: out.added.length });
    return out;
  }

  async function matchingCases(tx: DomainTx, projectId: string, filter: CycleFilter) {
    const set = (v?: string[]) => new Set((v ?? []).map((s) => s.trim().replace(/^@/, "").toLowerCase()).filter(Boolean));
    const [tags, reqs, prios, statuses] = [set(filter.tags), set(filter.requirementKeys), set(filter.priorities), set(filter.statuses)];
    const risk = new Map<string, number>();
    for (const d of await tx.list("requirement", projectId)) {
      const l = d.payload.riskLikelihood, i = d.payload.riskImpact;
      if (typeof l === "number" && typeof i === "number") risk.set(str(d.payload, "requirementKey").toLowerCase(), l * i);
    }
    const cases = (await tx.list("test_case", projectId)).sort(
      (a, b) => (str(a.payload, "createdAt") < str(b.payload, "createdAt") ? -1 : str(a.payload, "createdAt") > str(b.payload, "createdAt") ? 1 : a.seq - b.seq),
    );
    return cases
      .filter((d) => {
        const p = d.payload;
        const data = (p.data as Payload) ?? {};
        const lower = (k: string) => list(data, k).map((s) => s.trim().replace(/^@/, "").toLowerCase());
        const caseReqs = lower("requirementKeys");
        if (tags.size && !lower("tags").some((t) => tags.has(t))) return false;
        if (reqs.size && !caseReqs.some((r) => reqs.has(r))) return false;
        if (prios.size && !prios.has(str(p, "priority").toLowerCase())) return false;
        if (statuses.size && !statuses.has(str(p, "status").toLowerCase())) return false;
        if (filter.minRisk != null) {
          const levels = caseReqs.map((r) => risk.get(r)).filter((x): x is number => x !== undefined);
          if (!levels.length || Math.max(...levels) < filter.minRisk) return false;
        }
        return true;
      })
      .map((d) => d.entityId);
  }

  async function reorder(tx: DomainTx, entity: string, docs: RemoteDoc[], ids: string[]) {
    const ordered = [
      ...ids.map((id) => docs.find((d) => d.entityId === id)).filter((d): d is RemoteDoc => !!d),
      ...docs.filter((d) => !ids.includes(d.entityId)),
    ];
    let moved = 0;
    for (const [position, d] of ordered.entries()) {
      if (num(d.payload, "position") === position) continue;
      await tx.put(entity, d.entityId, { ...d.payload, position, updatedAt: now() }, d, false, { audit: "folded" });
      moved++;
    }
    return moved;
  }

  const configurations = {
    list: (userId: string, projectId: string, includeArchived: boolean) =>
      run(userId, async (tx) => {
        const project = await tx.get("project", projectId);
        if (!project || project.deleted) return [];
        return (await projectConfigurations(tx, projectId)).map((c) => c.view).filter((v) => includeArchived || !v.archived);
      }),
    create: (userId: string, input: ConfigurationInput) =>
      run(userId, async (tx) => {
        const projectId = input.projectId?.trim();
        if (!projectId) throw bad("invalid_configuration", "projectId is required");
        await liveProject(tx, projectId);
        const name = input.name?.trim();
        if (!name) throw bad("invalid_configuration", "name is required");
        const labels = checkLabels(input.matchLabels ?? []);
        await checkLabelsFree(tx, projectId, labels);
        const siblings = await tx.list("configuration", projectId);
        const id = randomUUID();
        const at = now();
        await tx.put(
          "configuration",
          id,
          {
            id,
            workspaceId: WORKSPACE,
            projectId,
            name,
            attributes: checkAttributes(input.attributes ?? {}),
            matchLabels: labels,
            position: Math.max(-1, ...siblings.map((d) => num(d.payload, "position"))) + 1,
            archivedAt: null,
            createdAt: at,
            updatedAt: at,
          },
          null,
        );
        return (await projectConfigurations(tx, projectId)).find((c) => c.view.id === id)?.view;
      }),
    update: (userId: string, id: string, input: ConfigurationInput, revision?: number) =>
      run(userId, async (tx) => {
        const doc = live(await tx.get("configuration", id), "Configuration", revision);
        const p = doc.payload;
        const projectId = str(p, "projectId");
        const next: Payload = { ...p, updatedAt: now() };
        if (input.name !== undefined) {
          const name = input.name.trim();
          if (!name) throw bad("invalid_configuration", "name is required");
          next.name = name;
        }
        if (input.attributes !== undefined) next.attributes = checkAttributes(input.attributes);
        if (input.matchLabels !== undefined) {
          next.matchLabels = checkLabels(input.matchLabels);
          // Only the labels it gains: a clash two devices made offline must
          // not block every later edit of either configuration.
          const had = new Set(list(p, "matchLabels").map(normalize));
          const added = (next.matchLabels as string[]).filter((l) => !had.has(normalize(l)));
          if (!isArchived(p)) await checkLabelsFree(tx, projectId, added, id);
        }
        await tx.put("configuration", id, next, doc);
        return (await projectConfigurations(tx, projectId)).find((c) => c.view.id === id)?.view;
      }),
    archive: (userId: string, id: string, archived: boolean) =>
      run(userId, async (tx) => {
        const doc = live(await tx.get("configuration", id), "Configuration");
        const projectId = str(doc.payload, "projectId");
        if (isArchived(doc.payload) !== archived) {
          if (!archived) await checkLabelsFree(tx, projectId, list(doc.payload, "matchLabels"), id);
          await tx.put("configuration", id, { ...doc.payload, archivedAt: archived ? now() : null, updatedAt: now() }, doc);
        }
        return (await projectConfigurations(tx, projectId)).find((c) => c.view.id === id)?.view;
      }),
    reorder: (userId: string, projectId: string, ids: string[]) =>
      run(userId, async (tx) => {
        await liveProject(tx, projectId);
        const docs = (await projectConfigurations(tx, projectId)).map((c) => c.doc);
        const moved = await reorder(tx, "configuration", docs, ids);
        if (moved) await tx.audit("update", "project", projectId, { configurationsReordered: moved });
        return (await projectConfigurations(tx, projectId)).map((c) => c.view);
      }),
  };

  const cycles = {
    list: (userId: string, projectId: string) =>
      run(userId, async (tx) => {
        const project = await tx.get("project", projectId);
        if (!project || project.deleted) return [];
        // Newest first by the payload's createdAt, then id, as on the desktop.
        const docs = (await tx.list("test_cycle", projectId)).sort((a, b) => {
          const [x, y] = [sortable(str(a.payload, "createdAt")), sortable(str(b.payload, "createdAt"))];
          return x < y ? 1 : x > y ? -1 : byId(b, a);
        });
        const data = await loadExecution(tx, projectId);
        const out = [];
        for (const d of docs) {
          const p = progressOf(d, data);
          out.push({ ...cycleView(d), items: p.items, runs: p.runs, progress: p.summary as ProgressSummary });
        }
        return out;
      }),
    get: (userId: string, id: string) =>
      run(userId, async (tx) => {
        const doc = await tx.get("test_cycle", id);
        return doc && !doc.deleted ? cycleView(doc) : null;
      }),
    create: (userId: string, input: CycleInput) =>
      run(userId, async (tx) => {
        const projectId = input.projectId?.trim();
        if (!projectId) throw bad("invalid_cycle", "projectId is required");
        await liveProject(tx, projectId);
        if (!input.title?.trim()) throw bad("invalid_cycle", "title is required");
        const base: Payload = {
          description: "",
          testPlanId: null,
          milestone: null,
          sprint: null,
          build: null,
          environment: null,
          configurationIds: [],
          startsOn: null,
          endsOn: null,
          status: "planned",
          data: {},
        };
        const next = await header(tx, projectId, base, input);
        const id = randomUUID();
        const at = now();
        const n = await tx.nextNumber(projectId, "cycle", KEY_PREFIX);
        const doc = await tx.put(
          "test_cycle",
          id,
          { ...next, id, workspaceId: WORKSPACE, projectId, cycleKey: `${KEY_PREFIX}${String(n).padStart(KEY_DIGITS, "0")}`, createdAt: at, updatedAt: at },
          null,
        );
        return cycleView(doc);
      }),
    update: (userId: string, id: string, input: CycleInput, revision?: number) =>
      run(userId, async (tx) => {
        const doc = await liveCycle(tx, id, revision);
        const next = await header(tx, str(doc.payload, "projectId"), doc.payload, input);
        return cycleView(await tx.put("test_cycle", id, { ...next, updatedAt: now() }, doc));
      }),
    clone: (userId: string, id: string, title?: string) =>
      run(userId, async (tx) => {
        const source = await liveCycle(tx, id);
        const projectId = str(source.payload, "projectId");
        let t = title?.trim() || `Copia de ${str(source.payload, "title")}`;
        if (utf16(t) > 500) t = t.slice(0, 250);
        const newId = randomUUID();
        const at = now();
        const n = await tx.nextNumber(projectId, "cycle", KEY_PREFIX);
        const items = await liveItems(tx, source);
        // Archived configurations are not offered to a new cycle: the copy
        // leaves them out.
        const archived = new Set(
          (await projectConfigurations(tx, projectId)).filter((c) => c.view.archived).map((c) => c.view.id),
        );
        for (const [position, i] of items.entries()) {
          const itemId = randomUUID();
          await tx.put(
            "test_cycle_item",
            itemId,
            { ...i.payload, id: itemId, cycleId: newId, position, createdAt: at, updatedAt: at, revision: undefined },
            null,
            false,
            { audit: "folded" },
          );
        }
        const doc = await tx.put(
          "test_cycle",
          newId,
          {
            ...source.payload,
            id: newId,
            cycleKey: `${KEY_PREFIX}${String(n).padStart(KEY_DIGITS, "0")}`,
            title: t,
            status: "planned",
            configurationIds: list(source.payload, "configurationIds").filter((c) => !archived.has(c)),
            createdAt: at,
            updatedAt: at,
          },
          null,
          false,
          { summary: { clonedFrom: str(source.payload, "cycleKey"), items: items.length } },
        );
        return cycleView(doc);
      }),
    /** Soft delete of the cycle and its items; its runs stay (ADR-0017). */
    remove: (userId: string, id: string, revision?: number) =>
      run(userId, async (tx) => {
        const doc = await liveCycle(tx, id, revision);
        const items = await liveItems(tx, doc);
        for (const i of items) await tx.put("test_cycle_item", i.entityId, i.payload, i, true, { audit: "folded" });
        await tx.put("test_cycle", id, doc.payload, doc, true, { summary: { cascade: { test_cycle_items: items.length } } });
      }),
    items: (userId: string, id: string) =>
      run(userId, async (tx) => {
        const doc = await tx.get("test_cycle", id);
        if (!doc || doc.deleted) return [];
        const out = [];
        for (const i of await liveItems(tx, doc)) {
          const kase = await tx.get("test_case", str(i.payload, "testCaseId"));
          const c = kase && !kase.deleted ? kase.payload : {};
          out.push({
            id: i.entityId,
            cycleId: id,
            testCaseId: str(i.payload, "testCaseId"),
            caseKey: str(c, "scenarioId"),
            caseTitle: str(c, "title"),
            caseStatus: str(c, "status"),
            casePriority: str(c, "priority"),
            flowId: strOrNull(i.payload, "flowId"),
            exampleRowId: strOrNull(i.payload, "exampleRowId"),
            assignee: strOrNull(i.payload, "assignee"),
            position: num(i.payload, "position"),
            revision: i.revision,
          });
        }
        return out;
      }),
    addItems: (userId: string, id: string, items: ItemInput[]) =>
      run(userId, async (tx) => addItems(tx, await liveCycle(tx, id), items)),
    addByFilter: (userId: string, id: string, filter: CycleFilter, assignee?: string | null) =>
      run(userId, async (tx) => {
        const cycle = await liveCycle(tx, id);
        const ids = await matchingCases(tx, str(cycle.payload, "projectId"), filter);
        return addItems(tx, cycle, ids.map((testCaseId) => ({ testCaseId, assignee })));
      }),
    filterPreview: (userId: string, projectId: string, filter: CycleFilter) =>
      run(userId, async (tx) => {
        const project = await tx.get("project", projectId);
        if (!project || project.deleted) return 0;
        return (await matchingCases(tx, projectId, filter)).length;
      }),
    updateItem: (userId: string, itemId: string, assignee: string | null) =>
      run(userId, async (tx) => {
        const item = live(await tx.get("test_cycle_item", itemId), "Cycle item");
        requireOpen(await liveCycle(tx, str(item.payload, "cycleId")));
        await tx.put("test_cycle_item", itemId, { ...item.payload, assignee: assignee?.trim() || null, updatedAt: now() }, item);
      }),
    removeItems: (userId: string, id: string, ids: string[]) =>
      run(userId, async (tx) => {
        const cycle = await liveCycle(tx, id);
        requireOpen(cycle);
        let removed = 0;
        for (const i of (await liveItems(tx, cycle)).filter((i) => ids.includes(i.entityId))) {
          await tx.put("test_cycle_item", i.entityId, i.payload, i, true, { audit: "folded" });
          removed++;
        }
        if (removed) await tx.audit("update", "test_cycle", id, { itemsRemoved: removed });
        return removed;
      }),
    reorderItems: (userId: string, id: string, ids: string[]) =>
      run(userId, async (tx) => {
        const cycle = await liveCycle(tx, id);
        requireOpen(cycle);
        const moved = await reorder(tx, "test_cycle_item", await liveItems(tx, cycle), ids);
        if (moved) await tx.audit("update", "test_cycle", id, { itemsReordered: moved });
      }),
    runs: (userId: string, id: string) =>
      run(userId, async (tx) => {
        const doc = await tx.get("test_cycle", id);
        if (!doc || doc.deleted) return [];
        return (await tx.list("run", str(doc.payload, "projectId")))
          .filter((d) => str(d.payload, "cycleId") === id)
          .sort((a, b) => {
            const [x, y] = [sortable(str(a.payload, "createdAt")), sortable(str(b.payload, "createdAt"))];
            return x < y ? 1 : x > y ? -1 : byId(b, a);
          })
          .map((d) => ({ ...d.payload, id: d.entityId }));
      }),
    progress: (userId: string, id: string) =>
      run(userId, async (tx) => {
        const doc = await tx.get("test_cycle", id);
        if (!doc || doc.deleted) return null;
        const data = await loadExecution(tx, str(doc.payload, "projectId"));
        const { configurationIds, cells: c, byConfiguration, summary } = progressOf(doc, data);
        return { configurationIds, cells: c, byConfiguration, summary };
      }),
  };

  return { configurations, cycles };
}

export type CycleService = ReturnType<typeof createCycleService>;

// ---- routes ------------------------------------------------------------------------

const idsSchema = z.object({ ids: z.array(text(200)).max(5000) });
const updateOf = <T extends z.ZodType>(input: T) => z.object({ input, revision: z.number().int().nonnegative().optional() });
const revisionQuery = z.object({ revision: z.coerce.number().int().nonnegative().optional() });

/** `/api/configurations` and `/api/cycles` (BASE-10): the web's side of
 *  CYC-01. «Ejecutar» has no endpoint: runs are created on the desktop. */
export function cycleRoutes(app: FastifyInstance, deps: { cycles: CycleService; tokens: TokenService }) {
  const { configurations, cycles } = deps.cycles;
  const preHandler = [makeRequireAuth(deps.tokens), requireSupportedVersion];
  const user = (req: FastifyRequest) => req.userId as string;
  const id = (req: FastifyRequest) => (req.params as { id: string }).id;

  app.get("/api/configurations", { preHandler }, (req) => {
    const q = z.object({ projectId: text(200).min(1), includeArchived: z.coerce.boolean().optional() }).parse(req.query);
    return configurations.list(user(req), q.projectId, q.includeArchived ?? false);
  });
  app.post("/api/configurations", { preHandler }, (req) => configurations.create(user(req), configurationInputSchema.parse(req.body)));
  app.post("/api/configurations/reorder", { preHandler }, (req) => {
    const b = z.object({ projectId: text(200).min(1), ids: z.array(text(200)).max(500) }).parse(req.body);
    return configurations.reorder(user(req), b.projectId, b.ids);
  });
  app.put("/api/configurations/:id", { preHandler }, (req) => {
    const { input, revision } = updateOf(configurationInputSchema).parse(req.body);
    return configurations.update(user(req), id(req), input, revision);
  });
  app.post("/api/configurations/:id/archive", { preHandler }, (req) =>
    configurations.archive(user(req), id(req), z.object({ archived: z.boolean() }).parse(req.body).archived),
  );

  app.get("/api/cycles", { preHandler }, (req) =>
    cycles.list(user(req), z.object({ projectId: text(200).min(1) }).parse(req.query).projectId),
  );
  app.post("/api/cycles", { preHandler }, (req) => cycles.create(user(req), cycleInputSchema.parse(req.body)));
  app.post("/api/cycles/filter-preview", { preHandler }, (req) => {
    const b = z.object({ projectId: text(200).min(1), filter: filterSchema }).parse(req.body);
    return cycles.filterPreview(user(req), b.projectId, b.filter);
  });
  app.get("/api/cycles/:id", { preHandler }, (req) => cycles.get(user(req), id(req)));
  app.put("/api/cycles/:id", { preHandler }, (req) => {
    const { input, revision } = updateOf(cycleInputSchema).parse(req.body);
    return cycles.update(user(req), id(req), input, revision);
  });
  app.delete("/api/cycles/:id", { preHandler }, async (req, reply) => {
    await cycles.remove(user(req), id(req), revisionQuery.parse(req.query).revision);
    return reply.code(204).send();
  });
  app.post("/api/cycles/:id/clone", { preHandler }, (req) =>
    cycles.clone(user(req), id(req), z.object({ title: text(500).optional() }).parse(req.body ?? {}).title),
  );
  app.get("/api/cycles/:id/items", { preHandler }, (req) => cycles.items(user(req), id(req)));
  app.post("/api/cycles/:id/items", { preHandler }, (req) =>
    cycles.addItems(user(req), id(req), z.object({ items: z.array(itemInputSchema).max(5000) }).parse(req.body).items),
  );
  app.post("/api/cycles/:id/items/by-filter", { preHandler }, (req) => {
    const b = z.object({ filter: filterSchema, assignee: optText }).parse(req.body);
    return cycles.addByFilter(user(req), id(req), b.filter, b.assignee);
  });
  app.post("/api/cycles/:id/items/remove", { preHandler }, (req) => cycles.removeItems(user(req), id(req), idsSchema.parse(req.body).ids));
  app.post("/api/cycles/:id/items/reorder", { preHandler }, async (req) => {
    await cycles.reorderItems(user(req), id(req), idsSchema.parse(req.body).ids);
    return cycles.items(user(req), id(req));
  });
  app.put("/api/cycle-items/:id", { preHandler }, async (req, reply) => {
    await cycles.updateItem(user(req), id(req), z.object({ assignee: optText }).parse(req.body).assignee ?? null);
    return reply.code(204).send();
  });
  app.get("/api/cycles/:id/runs", { preHandler }, (req) => cycles.runs(user(req), id(req)));
  app.get("/api/cycles/:id/progress", { preHandler }, (req) => cycles.progress(user(req), id(req)));
}
