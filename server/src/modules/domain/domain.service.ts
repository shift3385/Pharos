import { randomUUID } from "node:crypto";
import { AppError } from "../auth/errors";
import { isProvisionalKey, type KeyKind } from "../sync/sync.schemas";
import type { RemoteDoc } from "../sync/sync.repository";
import { staleWrite, type DomainStore, type DomainTx } from "./domain.store";
import type {
  PlannerCardInput,
  ProjectInput,
  RequirementImportRow,
  RequirementInput,
  TestCaseInput,
  TestPlanInput,
} from "./domain.schemas";

// The web's domain rules (BASE-10, ADR-0004). They are the rules of the
// desktop core (`project.rs`, `test_plan.rs`, `test_case.rs`,
// `requirement.rs`, `planner.rs`) applied to the server's document store; the
// browser holds none of them. Payloads have exactly the shape the desktop
// pushes and reads back (`sync.rs`), so either side can edit what the other
// wrote. Revision history and attachments stay on the desktop (SYNC-04b).

type Payload = Record<string, unknown>;

const DEFAULT_PREFIX = "ATS_";
const DEFAULT_DIGITS = 3;
const REQUIREMENT_PREFIX = "REQ-";
const REQUIREMENT_DIGITS = 3;
const DEFECT_PREFIX = "DEF-";
const DEFECT_DIGITS = 3;
const PRIORITIES = ["low", "medium", "high"];
/** Not a real workspace yet (TEN-01); the desktop ignores it on pull. */
const WORKSPACE = "local";

const notFound = (what: string) => new AppError(404, "not_found", `${what} not found.`);
const str = (p: Payload, key: string) => (typeof p[key] === "string" ? (p[key] as string) : "");
const num = (p: Payload, key: string) => (typeof p[key] === "number" ? (p[key] as number) : 0);
const byText = (key: string) => (a: Payload, b: Payload) => (str(a, key) < str(b, key) ? -1 : str(a, key) > str(b, key) ? 1 : 0);

/** Timestamps have the desktop's form, `YYYY-MM-DD HH:MM:SS` in UTC (SQLite
 *  `datetime('now')`), on both sides, so they sort as text (BASE-05: the shared
 *  fixture asserts it). Web documents written before this used ISO 8601;
 *  `sortable` reads both alike. */
export const timestamp = (at = new Date()) => at.toISOString().slice(0, 19).replace("T", " ");
export const sortable = (s: string) => s.slice(0, 19).replace("T", " ");
/** Orders documents by a timestamp; within the same second (the form has no
 *  milliseconds), by write order (`seq`). */
const byTime = (key: string) => (a: RemoteDoc, b: RemoteDoc) => {
  const [x, y] = [sortable(str(a.payload, key)), sortable(str(b.payload, key))];
  return x < y ? -1 : x > y ? 1 : a.seq - b.seq;
};
const newestFirst = (a: RemoteDoc, b: RemoteDoc) => byTime("updatedAt")(b, a);

/** A requirement key: letters, digits and `- _ . :` (`requirement.rs`). */
export const isValidKey = (key: string) => /^[A-Za-z0-9_.:-]+$/.test(key);

/** True when an AI-generated field still waits for review (IA-01). */
function aiPending(data: unknown): boolean {
  const prov = (data as { aiProvenance?: Record<string, { reviewedAt?: unknown }> } | null)?.aiProvenance;
  return !!prov && typeof prov === "object" && Object.values(prov).some((p) => p?.reviewedAt == null);
}

const pad = (n: number, digits: number) => String(n).padStart(digits, "0");

/** The live version a write is based on. `revision` is the one the client
 *  read: if the item changed since, the write is refused (409, FIX-04). */
function current(doc: RemoteDoc | null, what: string, revision?: number): RemoteDoc {
  if (!doc) throw notFound(what);
  if (doc.deleted) {
    if (revision === undefined) throw notFound(what);
    throw new AppError(409, "deleted_elsewhere", `${what} was deleted elsewhere since you opened it.`);
  }
  if (revision !== undefined && doc.revision !== revision) throw staleWrite(doc);
  return doc;
}

async function liveProject(tx: DomainTx, projectId: string): Promise<Payload> {
  const doc = await tx.get("project", projectId);
  if (!doc || doc.deleted) throw notFound("Project");
  return doc.payload;
}

/** A key typed by hand: valid, never provisional, never used before in the
 *  project, not even by a deleted item (ADR-0010). */
async function checkManualKey(tx: DomainTx, entity: string, projectId: string, key: string, valid: boolean) {
  if (!valid || isProvisionalKey(key)) throw new AppError(400, "invalid_key", `Invalid key: ${key}.`);
  const use = await tx.keyUse(entity, projectId, key);
  if (use === "live") throw new AppError(409, "key_taken", `The key ${key} is already used in this project.`);
  if (use === "deleted") {
    throw new AppError(409, "key_retired", `The key ${key} belonged to a deleted item and is never reused.`);
  }
}

async function nextKey(tx: DomainTx, projectId: string, kind: KeyKind, prefix: string, digits: number) {
  return `${prefix}${pad(await tx.nextNumber(projectId, kind, prefix), digits)}`;
}

const now = () => timestamp();

export function createDomainService(store: DomainStore) {
  const run = store.tx.bind(store);

  /** Deletes a live item (a tombstone keeps its payload, so its key stays
   *  taken). A project delete cascades to its children (FIX-05). */
  const remove = (entity: string, what: string) => (userId: string, id: string, revision?: number) =>
    run(userId, async (tx) => {
      const doc = current(await tx.get(entity, id), what, revision);
      await tx.put(entity, id, doc.payload, doc, true);
    });

  const projects = {
    list: (userId: string) =>
      run(userId, async (tx) =>
        (await tx.list("project"))
          .map((d) => d.payload)
          .sort((a, b) => str(a, "name").localeCompare(str(b, "name"), undefined, { sensitivity: "accent" }))
          .map((p) => ({
            id: p.id,
            name: p.name,
            caseIdPrefix: p.caseIdPrefix,
            caseIdDigits: p.caseIdDigits,
            updatedAt: p.updatedAt,
            revision: p.revision,
          })),
      ),
    get: (userId: string, id: string) =>
      run(userId, async (tx) => {
        const doc = await tx.get("project", id);
        return doc && !doc.deleted ? doc.payload : null;
      }),
    create: (userId: string, input: ProjectInput) =>
      run(userId, async (tx) => {
        const id = randomUUID();
        const at = now();
        const doc = await tx.put(
          "project",
          id,
          {
            id,
            workspaceId: WORKSPACE,
            ownerId: userId,
            name: input.name,
            caseIdPrefix: input.caseIdPrefix?.trim() || DEFAULT_PREFIX,
            caseIdDigits: input.caseIdDigits ?? DEFAULT_DIGITS,
            createdAt: at,
            updatedAt: at,
          },
          null,
        );
        return doc.payload;
      }),
    update: (userId: string, id: string, input: ProjectInput, revision?: number) =>
      run(userId, async (tx) => {
        const doc = current(await tx.get("project", id), "Project", revision);
        const next = await tx.put(
          "project",
          id,
          {
            ...doc.payload,
            name: input.name,
            caseIdPrefix: input.caseIdPrefix?.trim() || DEFAULT_PREFIX,
            caseIdDigits: input.caseIdDigits ?? DEFAULT_DIGITS,
            updatedAt: now(),
          },
          doc,
        );
        return next.payload;
      }),
    remove: remove("project", "Project"),
  };

  /** Plans are reachable through their live project only (FIX-08). Newest
   *  first. */
  async function livePlans(tx: DomainTx) {
    const live = new Set((await tx.list("project")).map((d) => d.entityId));
    return (await tx.list("test_plan"))
      .filter((d) => live.has(str(d.payload, "projectId")))
      .sort(newestFirst)
      .map((d) => d.payload);
  }

  function planPayload(prev: Payload, input: TestPlanInput): Payload {
    return {
      ...prev,
      title: input.title,
      version: input.version ?? "1.0",
      planDate: input.planDate ?? null,
      author: input.author,
      status: input.status ?? "draft",
      data: input.data,
      updatedAt: now(),
    };
  }

  const testPlans = {
    list: (userId: string) =>
      run(userId, async (tx) =>
        (await livePlans(tx)).map((p) => ({
          id: p.id,
          title: p.title,
          version: p.version,
          status: p.status,
          updatedAt: p.updatedAt,
          revision: p.revision,
        })),
      ),
    get: (userId: string, id: string) =>
      run(userId, async (tx) => (await livePlans(tx)).find((p) => p.id === id) ?? null),
    byProject: (userId: string, projectId: string) =>
      run(userId, async (tx) => (await livePlans(tx)).find((p) => p.projectId === projectId) ?? null),
    create: (userId: string, input: TestPlanInput) =>
      run(userId, async (tx) => {
        await liveProject(tx, input.projectId);
        const id = randomUUID();
        const at = now();
        const base = { id, workspaceId: WORKSPACE, projectId: input.projectId, createdAt: at };
        return (await tx.put("test_plan", id, planPayload(base, input), null)).payload;
      }),
    update: (userId: string, id: string, input: TestPlanInput, revision?: number) =>
      run(userId, async (tx) => {
        const doc = current(await tx.get("test_plan", id), "Test plan", revision);
        return (await tx.put("test_plan", id, planPayload(doc.payload, input), doc)).payload;
      }),
    remove: remove("test_plan", "Test plan"),
  };

  function casePayload(prev: Payload, input: TestCaseInput): Payload {
    return {
      ...prev,
      title: input.title,
      version: input.version ?? "1.0",
      status: input.status ?? "draft",
      priority: input.priority ?? "medium",
      author: input.author,
      data: input.data,
      updatedAt: now(),
    };
  }

  const testCases = {
    list: (userId: string, projectId: string) =>
      run(userId, async (tx) => {
        const project = await tx.get("project", projectId);
        if (!project || project.deleted) return [];
        return (await tx.list("test_case", projectId))
          .map((d) => d.payload)
          .sort(byText("scenarioId"))
          .map((c) => ({
            id: c.id,
            scenarioId: c.scenarioId,
            title: c.title,
            status: c.status,
            priority: c.priority,
            gherkinLevel: str((c.data ?? {}) as Payload, "gherkinLevel") || "basic",
            aiPending: aiPending(c.data),
            updatedAt: c.updatedAt,
            revision: c.revision,
          }));
      }),
    get: (userId: string, id: string) =>
      run(userId, async (tx) => {
        const doc = await tx.get("test_case", id);
        if (!doc || doc.deleted) return null;
        const project = await tx.get("project", str(doc.payload, "projectId"));
        return project && !project.deleted ? doc.payload : null;
      }),
    create: (userId: string, input: TestCaseInput) =>
      run(userId, async (tx) => {
        const project = await liveProject(tx, input.projectId);
        const typed = input.scenarioId?.trim();
        let scenarioId: string;
        if (typed) {
          await checkManualKey(tx, "test_case", input.projectId, typed, true);
          scenarioId = typed;
        } else {
          const prefix = str(project, "caseIdPrefix") || DEFAULT_PREFIX;
          scenarioId = await nextKey(tx, input.projectId, "case", prefix, num(project, "caseIdDigits") || DEFAULT_DIGITS);
        }
        const id = randomUUID();
        const base = { id, workspaceId: WORKSPACE, projectId: input.projectId, scenarioId, createdAt: now() };
        return (await tx.put("test_case", id, casePayload(base, input), null)).payload;
      }),
    /** The scenario id is immutable: an update never changes it. */
    update: (userId: string, id: string, input: TestCaseInput, revision?: number) =>
      run(userId, async (tx) => {
        const doc = current(await tx.get("test_case", id), "Test case", revision);
        return (await tx.put("test_case", id, casePayload(doc.payload, input), doc)).payload;
      }),
    remove: remove("test_case", "Test case"),
  };

  const priorityOf = (p?: string) => (p && PRIORITIES.includes(p) ? p : "medium");

  async function insertRequirement(tx: DomainTx, projectId: string, input: Omit<RequirementInput, "projectId">): Promise<RemoteDoc> {
    const typed = input.requirementKey?.trim();
    if (typed) await checkManualKey(tx, "requirement", projectId, typed, isValidKey(typed));
    const requirementKey = typed || (await nextKey(tx, projectId, "requirement", REQUIREMENT_PREFIX, REQUIREMENT_DIGITS));
    const id = randomUUID();
    const at = now();
    const payload = {
      id,
      workspaceId: WORKSPACE,
      projectId,
      requirementKey,
      title: input.title.trim(),
      description: input.description ?? "",
      priority: priorityOf(input.priority),
      createdAt: at,
      updatedAt: at,
    };
    return tx.put("requirement", id, payload, null);
  }

  /** The key is immutable: an update never changes it. */
  async function patchRequirement(tx: DomainTx, doc: RemoteDoc, input: Omit<RequirementInput, "projectId">): Promise<RemoteDoc> {
    const payload = {
      ...doc.payload,
      title: input.title.trim(),
      description: input.description ?? "",
      priority: priorityOf(input.priority),
      updatedAt: now(),
    };
    return tx.put("requirement", doc.entityId, payload, doc);
  }

  const requirements = {
    list: (userId: string, projectId: string) =>
      run(userId, async (tx) => {
        const project = await tx.get("project", projectId);
        if (!project || project.deleted) return [];
        return (await tx.list("requirement", projectId)).map((d) => d.payload).sort(byText("requirementKey"));
      }),
    get: (userId: string, id: string) =>
      run(userId, async (tx) => {
        const doc = await tx.get("requirement", id);
        return doc && !doc.deleted ? doc.payload : null;
      }),
    create: (userId: string, input: RequirementInput) =>
      run(userId, async (tx) => {
        await liveProject(tx, input.projectId);
        return (await insertRequirement(tx, input.projectId, input)).payload;
      }),
    update: (userId: string, id: string, input: RequirementInput, revision?: number) =>
      run(userId, async (tx) =>
        (await patchRequirement(tx, current(await tx.get("requirement", id), "Requirement", revision), input)).payload,
      ),
    remove: remove("requirement", "Requirement"),
    /** Upsert by key (`requirement.rs`): a row whose key a live requirement
     *  has updates it; a key of a deleted one is skipped and reported; the
     *  rest are created. All or nothing. */
    importRows: (userId: string, projectId: string, rows: RequirementImportRow[]) =>
      run(userId, async (tx) => {
        await liveProject(tx, projectId);
        const summary = { created: 0, updated: 0, skipped: [] as string[] };
        // The live requirements by key, read once and kept current as rows
        // update or create them (the import holds the user's write lock).
        const byKey = new Map((await tx.list("requirement", projectId)).map((d) => [str(d.payload, "requirementKey"), d]));
        for (const row of rows) {
          if (!row.title.trim()) continue;
          const key = row.requirementKey?.trim();
          const live = key ? byKey.get(key) : undefined;
          if (live) {
            byKey.set(key!, await patchRequirement(tx, live, row));
            summary.updated++;
          } else if (key && (await tx.keyUse("requirement", projectId, key)) === "deleted") {
            summary.skipped.push(key);
          } else {
            const created = await insertRequirement(tx, projectId, row);
            byKey.set(str(created.payload, "requirementKey"), created);
            summary.created++;
          }
        }
        return summary;
      }),
  };

  const byPosition = (a: RemoteDoc, b: RemoteDoc) =>
    num(a.payload, "position") - num(b.payload, "position") || byTime("createdAt")(a, b);

  /** A defect gets its key the first time it is a defect and keeps it. */
  async function defectKey(tx: DomainTx, projectId: string, kind: string, existing: unknown) {
    if (typeof existing === "string" && existing) return existing;
    return kind === "defect" ? nextKey(tx, projectId, "defect", DEFECT_PREFIX, DEFECT_DIGITS) : null;
  }

  const plannerCards = {
    list: (userId: string, projectId: string) =>
      run(userId, async (tx) => (await tx.list("planner_card", projectId)).sort(byPosition).map((d) => d.payload)),
    create: (userId: string, input: PlannerCardInput) =>
      run(userId, async (tx) => {
        await liveProject(tx, input.projectId);
        const status = input.status ?? "backlog";
        const column = (await tx.list("planner_card", input.projectId)).filter((d) => d.payload.status === status);
        const position = Math.max(-1, ...column.map((d) => num(d.payload, "position"))) + 1;
        const id = randomUUID();
        const at = now();
        const payload = {
          id,
          workspaceId: WORKSPACE,
          projectId: input.projectId,
          ownerId: userId,
          kind: input.kind,
          cardKey: await defectKey(tx, input.projectId, input.kind, null),
          title: input.title,
          status,
          priority: input.priority ?? "medium",
          position,
          data: input.data,
          createdAt: at,
          updatedAt: at,
        };
        return (await tx.put("planner_card", id, payload, null)).payload;
      }),
    update: (userId: string, id: string, input: PlannerCardInput, revision?: number) =>
      run(userId, async (tx) => {
        const doc = current(await tx.get("planner_card", id), "Card", revision);
        const payload = {
          ...doc.payload,
          kind: input.kind,
          cardKey: await defectKey(tx, str(doc.payload, "projectId"), input.kind, doc.payload.cardKey),
          title: input.title,
          priority: input.priority ?? "medium",
          data: input.data,
          updatedAt: now(),
        };
        return (await tx.put("planner_card", id, payload, doc)).payload;
      }),
    remove: remove("planner_card", "Card"),
    /** The order of a column after a drag: each card gets its index and the
     *  column's status (moves and reorders). Unknown ids are skipped. */
    reorder: (userId: string, status: string, ids: string[]) =>
      run(userId, async (tx) => {
        for (const [position, id] of ids.entries()) {
          const doc = await tx.get("planner_card", id);
          if (!doc || doc.deleted) continue;
          await tx.put("planner_card", id, { ...doc.payload, status, position, updatedAt: now() }, doc);
        }
      }),
  };

  return { projects, testPlans, testCases, requirements, plannerCards };
}

export type DomainService = ReturnType<typeof createDomainService>;
