// Runs on the web (EJE-06, ADR-0013): the desktop's rules for creating a run,
// adding items (frozen revisions, no overlaps), recording attempts (one per
// attempt id, inside the item's targets), closing and reopening, and
// «Ejecutar» of a cycle, over the documents the desktop syncs. The pure twin
// of the targets is checked against the shared vectors.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { narrow, overlaps, targetsOf } from "../src/modules/domain/runs-targets";
import { createDomainStore, type DomainStore, type DomainTx } from "../src/modules/domain/domain.store";
import { createRunService } from "../src/modules/domain/runs";
import { createServerClock } from "../src/modules/sync/sync.hlc";
import { LOCK_USER_SQL } from "../src/modules/sync/sync.repository";

type Payload = Record<string, unknown>;

let app: FastifyInstance;
let pool: Pool;

beforeAll(async () => {
  ({ app, pool } = await setupTestApp());
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  await pool.query("TRUNCATE key_blocks");
});

async function tokenFor(email = "runs-web@pharos.dev"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "S", firstName: "A", lastName: "B" },
  });
  return res.json().accessToken as string;
}

const headersOf = (token: string) => ({
  authorization: `Bearer ${token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: SERVER_FEATURES.join(","),
});

const api = (token: string) => {
  const headers = headersOf(token);
  return async (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) => {
    const res = await app.inject({ method, url, headers, payload });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  };
};
type Call = ReturnType<typeof api>;

const docs = async (entity: string) =>
  (
    await pool.query<{ entity_id: string; payload: Payload; deleted: boolean }>(
      "SELECT entity_id, payload, deleted FROM documents WHERE entity = $1 ORDER BY seq",
      [entity],
    )
  ).rows;

type Event = { action: string; entity: string; entityId: string; summary?: string | null; changes?: string | null };
const events = async () =>
  (
    await pool.query<{ payload: Event }>(
      `SELECT payload FROM documents WHERE entity = 'audit_event' ORDER BY (payload->>'chainSeq')::bigint`,
    )
  ).rows.map((r) => r.payload);

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---- shared vectors ------------------------------------------------------------------

interface TargetVectors {
  cases: {
    name: string;
    caseId: string;
    data: Payload;
    items: { flowId: string | null; rowId: string | null; targets: unknown[] }[];
    narrow: {
      item: { flowId: string | null; exampleRowId: string | null; exampleRow: number | null };
      flowId: string | null;
      rowId: string | null;
      expect: unknown;
    }[];
    overlap: { a: { flowId: string | null; rowId: string | null }; b: { flowId: string | null; rowId: string | null }; expect: boolean }[];
  }[];
}

describe("execution target vectors (shared with the desktop)", () => {
  const vectors = JSON.parse(
    readFileSync(new URL("../../src-tauri/tests/fixtures/execution-target-vectors.json", import.meta.url), "utf8"),
  ) as TargetVectors;
  for (const c of vectors.cases) {
    it(c.name, () => {
      for (const item of c.items) expect(targetsOf(c.caseId, c.data, item.flowId, item.rowId)).toEqual(item.targets);
      for (const n of c.narrow) expect(narrow(c.data, n.item, n.flowId, n.rowId)).toEqual(n.expect);
      for (const o of c.overlap) {
        const t = (x: { flowId: string | null; rowId: string | null }) => targetsOf(c.caseId, c.data, x.flowId, x.rowId);
        expect(overlaps(t(o.a), t(o.b))).toBe(o.expect);
      }
    });
  }
});

// ---- the web API -----------------------------------------------------------------------

/** A project with a simple case and an Outline case with a flow. */
async function seed(call: Call) {
  const projectId = (await call("POST", "/api/projects", { name: "Checkout" })).body.id as string;
  const simple = (await call("POST", "/api/test-cases", { projectId, title: "Pay", status: "approved", priority: "high", data: { steps: ["open", "pay"] } })).body;
  const outline = (
    await call("POST", "/api/test-cases", {
      projectId,
      title: "Login",
      status: "approved",
      priority: "medium",
      data: {
        gherkinLevel: "advanced",
        steps: ["log in as <user>"],
        examples: { headers: ["user"], rows: [["ana"], ["bo"]] },
        flows: [{ name: "Refund", steps: ["refund"] }],
      },
    })
  ).body;
  const full = (await call("GET", `/api/test-cases/${outline.id}`)).body;
  const simpleFull = (await call("GET", `/api/test-cases/${simple.id}`)).body;
  return {
    projectId,
    simple: { id: simple.id as string, key: simple.scenarioId as string, steps: (simpleFull.data.steps as Payload[]).map((s) => s.id as string) },
    outline: {
      id: outline.id as string,
      key: outline.scenarioId as string,
      rows: (full.data.examples.rows as Payload[]).map((r) => r.id as string),
      flow: full.data.flows[0].id as string,
      step: full.data.steps[0].id as string,
    },
  };
}

describe("runs on the web", () => {
  it("creates a manual run with its items, frozen at the case's current revision", async () => {
    const call = api(await tokenFor());
    const s = await seed(call);
    const res = await call("POST", "/api/runs", {
      input: { projectId: s.projectId, title: "Manual", environment: "staging", build: "1.2.3" },
      items: [{ testCaseId: s.simple.id }, { testCaseId: s.outline.id }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ runKey: "RUN-001", title: "Manual", trigger: "manual", status: "in_progress", environment: "staging" });
    const [run] = await docs("run");
    // The desktop's `read_payload` keys, nothing else.
    expect(Object.keys(run.payload).sort()).toEqual(
      [
        "id", "workspaceId", "projectId", "runKey", "title", "trigger", "sourceTool", "sourceToolVersion", "testPlanId",
        "cycleId", "configurationId", "environment", "build", "commitSha", "branch", "repositoryUrl", "ciUrl", "dataset",
        "context", "status", "startedAt", "finishedAt", "summary", "data", "createdAt", "updatedAt", "revision",
      ].sort(),
    );
    expect(run.payload.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const items = await docs("run_item");
    expect(items.map((i) => i.payload.position)).toEqual([0, 1]);
    const revisions = await docs("test_case_revision");
    for (const i of items) expect(revisions.map((r) => r.entity_id)).toContain(i.payload.testCaseRevisionId);

    // Editing the case after: the item keeps its revision, and says so.
    const kase = (await call("GET", `/api/test-cases/${s.simple.id}`)).body;
    await call("PUT", `/api/test-cases/${s.simple.id}`, { input: { ...kase, title: "Pay twice" }, revision: kase.revision });
    const detail = (await call("GET", `/api/run-items/${items[0].entity_id}`)).body;
    expect(detail).toMatchObject({ caseChanged: true, frozenRevision: 1, currentRevision: 2, caseTitle: "Pay twice", draft: null, attachments: [] });
    expect(detail.item.testCaseRevisionId).toBe(items[0].payload.testCaseRevisionId);
    const overview = (await call("GET", `/api/runs/${res.body.id}/overview`)).body;
    expect(overview.items.map((i: Payload) => [i.caseKey, i.targets, i.done, i.status])).toEqual([
      [s.simple.key, 1, 0, "not_run"],
      [s.outline.key, 3, 0, "not_run"],
    ]);
    expect(overview.counts).toEqual({ passed: 0, failed: 0, blocked: 0, skipped: 0, other: 0, notRun: 4, total: 4 });
    expect((await call("GET", `/api/runs?projectId=${s.projectId}`)).body.map((r: Payload) => r.runKey)).toEqual(["RUN-001"]);
  });

  it("refuses overlapping items in the run and within one call, and leaves no empty run", async () => {
    const call = api(await tokenFor());
    const s = await seed(call);
    const both = await call("POST", "/api/runs", {
      input: { projectId: s.projectId, title: "Manual" },
      items: [{ testCaseId: s.outline.id }, { testCaseId: s.outline.id, flowId: s.outline.flow }],
    });
    expect(both).toMatchObject({ status: 409, body: { code: "item_overlap", message: `item-overlap: ${s.outline.key}` } });
    expect(await docs("run")).toEqual([]);
    const run = (await call("POST", "/api/runs", { input: { projectId: s.projectId, title: "M" }, items: [{ testCaseId: s.outline.id, exampleRowId: s.outline.rows[0] }] })).body;
    // Another row and the flow do not overlap; the whole case does.
    expect((await call("POST", `/api/runs/${run.id}/items`, { items: [{ testCaseId: s.outline.id, exampleRowId: s.outline.rows[1] }, { testCaseId: s.outline.id, flowId: s.outline.flow }] })).status).toBe(200);
    expect((await call("POST", `/api/runs/${run.id}/items`, { items: [{ testCaseId: s.outline.id }] })).body.message).toBe(`item-overlap: ${s.outline.key}`);
    expect((await call("POST", `/api/runs/${run.id}/items`, { items: [{ testCaseId: s.outline.id, flowId: "nope" }] })).body.message).toBe("flow not in the case revision: nope");
    expect((await call("POST", `/api/runs/${run.id}/items`, { items: [{ testCaseId: s.outline.id, exampleRowId: "nope" }] })).body.message).toBe(
      "example row not in that flow of the case revision: nope",
    );
  });

  it("records an attempt once per attempt id, inside the item's targets", async () => {
    const call = api(await tokenFor());
    const s = await seed(call);
    const run = (await call("POST", "/api/runs", { input: { projectId: s.projectId, title: "M" }, items: [{ testCaseId: s.simple.id }, { testCaseId: s.outline.id }] })).body;
    const [simpleItem, outlineItem] = (await docs("run_item")).map((d) => d.entity_id);
    const record = (input: Payload) => call("POST", "/api/results", { input });
    const attempt = {
      runItemId: simpleItem,
      attemptId: uuid(1).toUpperCase(),
      status: "failed",
      durationMs: 1200,
      startedAt: "2026-11-05T10:00:00.000Z",
      errorMessage: "declined",
      attributes: { notes: "card declined" },
      steps: [
        { stepId: s.simple.steps[0], text: "open", status: "passed" },
        { stepId: s.simple.steps[1], text: "pay", status: "failed", actual: "declined" },
      ],
    };
    expect(await record({ ...attempt, attemptId: undefined })).toMatchObject({ status: 400, body: { message: "attempt-id-required" } });
    expect(await record({ ...attempt, attemptId: "nope" })).toMatchObject({ status: 400, body: { message: "attempt-id-invalid: nope" } });
    const first = await record(attempt);
    expect(first).toMatchObject({ status: 200, body: { id: uuid(1) } });
    // A retry (a double Ctrl+Enter) returns it and writes nothing.
    expect((await record(attempt)).body).toEqual({ id: uuid(1) });
    const [result] = await docs("result");
    expect(Object.keys(result.payload).sort()).toEqual(
      [
        "id", "workspaceId", "projectId", "runId", "shardId", "runItemId", "testKey", "testCaseId", "testCaseRevisionId",
        "caseRevision", "caseKey", "flowId", "exampleRowId", "exampleRow", "exampleValues", "configurationId",
        "configurationLabel", "attempt", "status", "rawStatus", "durationMs", "startedAt", "finishedAt", "errorMessage",
        "errorTrace", "executedBy", "externalId", "attributes", "createdBy", "createdAt", "hlc", "steps",
      ].sort(),
    );
    expect(result.payload).toMatchObject({
      testKey: `manual:${s.simple.id}/-/-`,
      caseKey: s.simple.key,
      caseRevision: 1,
      attempt: 0,
      shardId: null,
      configurationLabel: null,
      attributes: { notes: "card declined" },
    });
    expect((result.payload.steps as Payload[]).map((x) => [x.position, x.status, x.actual])).toEqual([
      [0, "passed", null],
      [1, "failed", "declined"],
    ]);
    // Another item cannot take that id.
    expect((await record({ ...attempt, runItemId: outlineItem, exampleRowId: s.outline.rows[0], steps: [] })).body).toMatchObject({
      code: "attempt_id_taken",
      message: "attempt-id-taken",
    });
    // An Outline item takes attempts per target only.
    expect((await record({ runItemId: outlineItem, attemptId: uuid(2), status: "passed" })).body.message).toBe("target-not-in-item: -/-");
    expect((await record({ runItemId: outlineItem, attemptId: uuid(2), status: "passed", exampleRowId: s.outline.rows[1], steps: [{ stepId: "nope", text: "x", status: "passed" }] })).body.message).toBe(
      "step not in that flow of the case revision: nope",
    );
    const row = await record({ runItemId: outlineItem, attemptId: uuid(2), status: "passed", exampleRowId: s.outline.rows[1], steps: [{ stepId: s.outline.step, text: "log in as bo", status: "passed" }] });
    expect(row.status).toBe(200);
    const stored = (await docs("result")).find((d) => d.entity_id === uuid(2))!.payload;
    expect(stored).toMatchObject({ exampleRowId: s.outline.rows[1], exampleRow: 1, exampleValues: { user: "bo" }, testKey: `manual:${s.outline.id}/-/${s.outline.rows[1]}` });
    // The same attempt id for another target of the same item is taken.
    expect((await record({ runItemId: outlineItem, attemptId: uuid(2), status: "passed", flowId: s.outline.flow })).body.message).toBe("attempt-id-taken");
    // A second attempt of the simple case: attempt 1, the final one.
    await record({ ...attempt, attemptId: uuid(3), status: "passed", startedAt: "2026-11-05T11:00:00.000Z", steps: [] });
    const overview = (await call("GET", `/api/runs/${run.id}/overview`)).body;
    expect(overview.items.map((i: Payload) => [i.done, i.status, i.attempts])).toEqual([
      [1, "passed", 2],
      [1, "passed", 1],
    ]);
    expect(overview.counts).toMatchObject({ passed: 2, notRun: 2, total: 4 });
    const detail = (await call("GET", `/api/run-items/${simpleItem}`)).body;
    expect(detail.results.map((r: Payload) => [r.attempt, r.status, r.isFinal, r.flaky])).toEqual([
      [0, "failed", false, true],
      [1, "passed", true, true],
    ]);
    expect((await call("GET", `/api/runs/counts?projectId=${s.projectId}`)).body).toEqual([
      { runId: run.id, passed: 2, failed: 0, other: 0, unlinked: 0 },
    ]);
    // One `execute` event per attempt, with the status and the test.
    const executed = (await events()).filter((e) => e.action === "execute");
    expect(executed.map((e) => e.entityId)).toEqual([uuid(1), uuid(2), uuid(3)]);
    expect(JSON.parse(executed[0].changes ?? "{}")).toEqual({ status: [null, "failed"] });
    expect(JSON.parse(executed[0].summary ?? "{}")).toMatchObject({ runId: run.id, runItemId: simpleItem, attempt: 0, steps: 2 });
  });

  it("closes and reopens a run; a closed run or cycle refuses writes", async () => {
    const call = api(await tokenFor());
    const s = await seed(call);
    const cycle = (await call("POST", "/api/cycles", { projectId: s.projectId, title: "Sprint" })).body;
    const run = (await call("POST", "/api/runs", { input: { projectId: s.projectId, title: "M", cycleId: cycle.id }, items: [{ testCaseId: s.simple.id }] })).body;
    const [item] = (await docs("run_item")).map((d) => d.entity_id);
    const closed = await call("POST", `/api/runs/${run.id}/close`, { status: "completed", revision: run.revision });
    expect(closed.body).toMatchObject({ status: "completed" });
    expect(closed.body.finishedAt).toMatch(/Z$/);
    expect((await call("POST", "/api/results", { input: { runItemId: item, attemptId: uuid(9), status: "passed" } })).body).toMatchObject({ code: "run_closed", message: "run-closed" });
    expect((await call("POST", `/api/runs/${run.id}/items`, { items: [{ testCaseId: s.outline.id }] })).body.message).toBe("run-closed");
    expect((await call("POST", `/api/runs/${run.id}/close`, { status: "aborted" })).body.message).toBe("run-closed");
    expect((await call("PUT", `/api/runs/${run.id}`, { input: { title: "x" }, revision: 1 })).body.code).toBe("stale_write");
    // A run of a closed cycle stays closed.
    const c = (await call("GET", `/api/cycles/${cycle.id}`)).body;
    await call("PUT", `/api/cycles/${cycle.id}`, { input: { status: "closed" }, revision: c.revision });
    expect((await call("PUT", `/api/runs/${run.id}`, { input: { status: "in_progress" } })).body).toMatchObject({ code: "cycle_closed", message: "cycle-closed" });
    const c2 = (await call("GET", `/api/cycles/${cycle.id}`)).body;
    await call("PUT", `/api/cycles/${cycle.id}`, { input: { status: "active" }, revision: c2.revision });
    const reopened = (await call("PUT", `/api/runs/${run.id}`, { input: { status: "in_progress", title: "ignored" } })).body;
    expect(reopened).toMatchObject({ status: "in_progress", finishedAt: null, title: "M" });
    expect((await call("POST", "/api/results", { input: { runItemId: item, attemptId: uuid(9), status: "passed" } })).status).toBe(200);
    const runEvents = (await events()).filter((e) => e.entity === "run").map((e) => e.action);
    expect(runEvents).toEqual(["create", "update", "update", "update"]);
  });

  it("refuses writes on a deleted run, and another user's run is not found", async () => {
    const mine = await tokenFor();
    const call = api(mine);
    const s = await seed(call);
    const run = (await call("POST", "/api/runs", { input: { projectId: s.projectId, title: "M" }, items: [{ testCaseId: s.simple.id }] })).body;
    const [item] = (await docs("run_item")).map((d) => d.entity_id);
    const other = api(await tokenFor("other@pharos.dev"));
    expect((await other("GET", `/api/runs/${run.id}/overview`)).body).toBeNull();
    expect((await other("POST", "/api/results", { input: { runItemId: item, attemptId: uuid(1), status: "passed" } })).status).toBe(404);
    expect((await other("PUT", `/api/runs/${run.id}`, { input: { title: "x" } })).status).toBe(404);
    // One attempt before the delete: it stays stored, but no longer counts.
    await call("POST", "/api/results", { input: { runItemId: item, attemptId: uuid(2), status: "passed" } });
    const defect = (
      await call("POST", "/api/defects", { projectId: s.projectId, title: "Bug", data: {}, links: [{ targetKind: "result", targetId: uuid(2) }] })
    ).body;
    // The desktop deletes the run (EJE-07): its tombstone arrives by push.
    const [stored] = await docs("run");
    const current = (await pool.query<{ revision: number }>("SELECT revision FROM documents WHERE entity = 'run'")).rows[0];
    const pushed = await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: headersOf(mine),
      payload: {
        deltas: [
          { entity: "run", entityId: run.id, op: "delete", revision: current.revision + 1, author: "u", hlc: "999999999999999-00000-desk", payload: stored.payload },
        ],
      },
    });
    expect(pushed.statusCode).toBe(200);
    expect((await docs("run"))[0].deleted).toBe(true);
    // Every write to it is refused with `run-deleted`.
    const refused = { status: 409, body: { code: "run_deleted", message: "run-deleted" } };
    expect(await call("POST", "/api/results", { input: { runItemId: item, attemptId: uuid(1), status: "passed" } })).toMatchObject(refused);
    expect(await call("POST", "/api/results", { input: { runItemId: item, attemptId: uuid(2), status: "passed" } })).toMatchObject(refused);
    expect(await call("POST", `/api/runs/${run.id}/items`, { items: [{ testCaseId: s.outline.id }] })).toMatchObject(refused);
    expect(await call("POST", `/api/runs/${run.id}/close`, { status: "completed" })).toMatchObject(refused);
    expect(await call("PUT", `/api/runs/${run.id}`, { input: { status: "in_progress" } })).toMatchObject(refused);
    // And reads leave it out; its result stays stored but counts nowhere.
    expect((await call("GET", `/api/runs?projectId=${s.projectId}`)).body).toEqual([]);
    expect((await call("GET", `/api/runs/counts?projectId=${s.projectId}`)).body).toEqual([]);
    expect((await call("GET", `/api/runs/${run.id}`)).body).toBeNull();
    // Its screen says so, as the desktop's (`RunDetail` shows a notice).
    expect(await call("GET", `/api/runs/${run.id}/overview`)).toMatchObject(refused);
    expect((await call("GET", `/api/runs/${run.id}/results`)).body).toEqual([]);
    expect((await call("GET", `/api/run-items/${item}`)).body).toBeNull();
    expect((await docs("result")).map((d) => d.entity_id)).toEqual([uuid(2)]);
    // A defect is not drafted from a result of a deleted run.
    expect(await call("GET", `/api/results/${uuid(2)}/defect-draft`)).toMatchObject(refused);
    // But one linked before keeps its link, label and case (ADR-0016).
    const linked = (await call("GET", `/api/defects/${defect.id}`)).body;
    expect(linked.links.map((l: Payload) => [l.targetKind, l.label])).toEqual([
      ["result", `${run.runKey} · ${s.simple.key} #0`],
    ]);
    expect(linked.caseIds).toEqual([s.simple.id]);
  });

  it("reads a run without waiting for the user's write lock", async () => {
    const token = await tokenFor();
    const call = api(token);
    const s = await seed(call);
    const run = (await call("POST", "/api/runs", { input: { projectId: s.projectId, title: "M" }, items: [{ testCaseId: s.simple.id }] })).body;
    const [item] = (await docs("run_item")).map((d) => d.entity_id);
    const userId = (await pool.query<{ id: string }>("SELECT id FROM users LIMIT 1")).rows[0].id;
    // A push (or a web write) holds the lock.
    const holder = await pool.connect();
    await holder.query("BEGIN");
    await holder.query(LOCK_USER_SQL, [userId]);
    try {
      const within = <T>(p: Promise<T>) =>
        Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("waited for the lock")), 3000))]);
      expect((await within(call("GET", `/api/runs/${run.id}/overview`))).status).toBe(200);
      expect((await within(call("GET", `/api/run-items/${item}`))).status).toBe(200);
      expect((await within(call("GET", `/api/runs?projectId=${s.projectId}`))).status).toBe(200);
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
  });

  it("takes an attempt id in every form the desktop takes, and refuses an instant without its zone", async () => {
    const call = api(await tokenFor());
    const s = await seed(call);
    await call("POST", "/api/runs", { input: { projectId: s.projectId, title: "M" }, items: [{ testCaseId: s.simple.id }] });
    const [item] = (await docs("run_item")).map((d) => d.entity_id);
    const id = uuid(42);
    const plain = id.replace(/-/g, "").toUpperCase();
    expect((await call("POST", "/api/results", { input: { runItemId: item, attemptId: `urn:uuid:${id}`, status: "passed" } })).body).toEqual({ id });
    expect((await call("POST", "/api/results", { input: { runItemId: item, attemptId: plain, status: "passed" } })).body).toEqual({ id });
    expect((await docs("result")).map((d) => d.entity_id)).toEqual([id]);
    const late = await call("POST", "/api/results", {
      input: { runItemId: item, attemptId: uuid(43), status: "passed", startedAt: "yesterday" },
    });
    expect(late.status).toBe(400);
    const local = await call("POST", "/api/results", {
      input: { runItemId: item, attemptId: uuid(43), status: "passed", finishedAt: "2026-11-05 10:00:00" },
    });
    expect(local.status).toBe(400);
  });

  it("numbers new items after every item ever added, deleted ones too", async () => {
    const call = api(await tokenFor());
    const s = await seed(call);
    const run = (await call("POST", "/api/runs", { input: { projectId: s.projectId, title: "M" }, items: [{ testCaseId: s.simple.id }, { testCaseId: s.outline.id }] })).body;
    // The last item is deleted (by a device, as its tombstone).
    const last = (await docs("run_item")).find((d) => d.payload.position === 1)!;
    await pool.query("UPDATE documents SET deleted = true WHERE entity = 'run_item' AND entity_id = $1", [last.entity_id]);
    const added = (await call("POST", `/api/runs/${run.id}/items`, { items: [{ testCaseId: s.outline.id }] })).body;
    expect(added.map((i: Payload) => i.position)).toEqual([2]);
  });

  it("results of a deleted run do not count in another run's views", async () => {
    const mine = await tokenFor();
    const call = api(mine);
    const s = await seed(call);
    const kept = (await call("POST", "/api/runs", { input: { projectId: s.projectId, title: "Kept" }, items: [{ testCaseId: s.simple.id }] })).body;
    const gone = (await call("POST", "/api/runs", { input: { projectId: s.projectId, title: "Gone" }, items: [{ testCaseId: s.simple.id }] })).body;
    const items = await docs("run_item");
    const itemOf = (runId: string) => items.find((i) => i.payload.runId === runId)!.entity_id;
    await call("POST", "/api/results", { input: { runItemId: itemOf(kept.id), attemptId: uuid(1), status: "passed" } });
    await call("POST", "/api/results", { input: { runItemId: itemOf(gone.id), attemptId: uuid(2), status: "failed" } });
    await pool.query("UPDATE documents SET deleted = true WHERE entity = 'run' AND entity_id = $1", [gone.id]);
    expect((await call("GET", `/api/runs/counts?projectId=${s.projectId}`)).body).toEqual([
      { runId: kept.id, passed: 1, failed: 0, other: 0, unlinked: 0 },
    ]);
    expect((await call("GET", `/api/runs?projectId=${s.projectId}`)).body.map((r: Payload) => r.title)).toEqual(["Kept"]);
  });

  it("executes a cycle: one run per configuration, all or nothing", async () => {
    const call = api(await tokenFor());
    const s = await seed(call);
    const chrome = (await call("POST", "/api/configurations", { projectId: s.projectId, name: "Chrome" })).body;
    const firefox = (await call("POST", "/api/configurations", { projectId: s.projectId, name: "Firefox" })).body;
    const cycle = (await call("POST", "/api/cycles", { projectId: s.projectId, title: "Sprint 1", build: "9", configurationIds: [chrome.id, firefox.id] })).body;
    expect((await call("POST", `/api/cycles/${cycle.id}/execute`, {})).body.message).toBe("cycle-empty");
    await call("POST", `/api/cycles/${cycle.id}/items`, { items: [{ testCaseId: s.simple.id }, { testCaseId: s.outline.id, flowId: s.outline.flow }] });
    expect((await call("POST", `/api/cycles/${cycle.id}/execute`, { configurationIds: ["nope"] })).body.message).toBe("configuration not in the cycle: nope");
    expect((await call("POST", `/api/cycles/${cycle.id}/execute`, { configurationIds: [] })).body.message).toBe("no-configuration-chosen");
    const res = await call("POST", `/api/cycles/${cycle.id}/execute`, { environment: "qa" });
    expect(res.status).toBe(200);
    expect(res.body.missingConfigurations).toEqual([]);
    expect(res.body.runs.map((r: Payload) => [r.title, r.configurationId, r.cycleId, r.build, r.environment, r.trigger])).toEqual([
      [`${cycle.cycleKey} · Sprint 1 · Chrome`, chrome.id, cycle.id, "9", "qa", "manual"],
      [`${cycle.cycleKey} · Sprint 1 · Firefox`, firefox.id, cycle.id, "9", "qa", "manual"],
    ]);
    const items = await docs("run_item");
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.payload.configurationId)).toEqual([chrome.id, chrome.id, firefox.id, firefox.id]);
    expect((await call("GET", `/api/cycles/${cycle.id}`)).body.status).toBe("active");
    expect((await call("GET", `/api/cycles/${cycle.id}/runs`)).body).toHaveLength(2);
    // A deleted case: nothing is created, the error names it.
    const before = (await docs("run")).length;
    const kase = (await call("GET", `/api/test-cases/${s.simple.id}`)).body;
    await call("DELETE", `/api/test-cases/${s.simple.id}?revision=${kase.revision}`);
    expect((await call("POST", `/api/cycles/${cycle.id}/execute`, {})).body.message).toBe(`cycle-item-case-gone: ${s.simple.key}`);
    expect(await docs("run")).toHaveLength(before);
    // Progress reads what the web recorded.
    const firstItem = items[0].entity_id;
    await call("POST", "/api/results", { input: { runItemId: firstItem, attemptId: uuid(5), status: "failed" } });
    const progress = (await call("GET", `/api/cycles/${cycle.id}/progress`)).body;
    expect(progress.summary.failed).toBe(1);
    // Executing a closed cycle is refused.
    const c = (await call("GET", `/api/cycles/${cycle.id}`)).body;
    await call("PUT", `/api/cycles/${cycle.id}`, { input: { status: "closed" }, revision: c.revision });
    expect((await call("POST", `/api/cycles/${cycle.id}/execute`, {})).body.message).toBe("cycle-closed");
  });

  it("«Ejecutar» is all or nothing: a failure on the second run leaves no run and the cycle planned", async () => {
    const call = api(await tokenFor());
    const s = await seed(call);
    const chrome = (await call("POST", "/api/configurations", { projectId: s.projectId, name: "Chrome" })).body;
    const firefox = (await call("POST", "/api/configurations", { projectId: s.projectId, name: "Firefox" })).body;
    const cycle = (await call("POST", "/api/cycles", { projectId: s.projectId, title: "Sprint", configurationIds: [chrome.id, firefox.id] })).body;
    await call("POST", `/api/cycles/${cycle.id}/items`, { items: [{ testCaseId: s.simple.id }] });
    const userId = (await pool.query<{ id: string }>("SELECT id FROM users LIMIT 1")).rows[0].id;
    // The same store, failing when the second run is written.
    const real = createDomainStore(pool, createServerClock());
    const failing: DomainStore = {
      ...real,
      tx: (user, fn) =>
        real.tx(user, (tx) => {
          let runs = 0;
          const wrapped: DomainTx = {
            ...tx,
            put: (entity, id, payload, current, deleted, opts) => {
              if (entity === "run" && !current && ++runs === 2) throw new Error("disk full");
              return tx.put(entity, id, payload, current, deleted, opts);
            },
          };
          return fn(wrapped);
        }),
    };
    await expect(createRunService(failing).execute(userId, cycle.id, {})).rejects.toThrow("disk full");
    expect(await docs("run")).toEqual([]);
    expect(await docs("run_item")).toEqual([]);
    expect((await call("GET", `/api/cycles/${cycle.id}`)).body.status).toBe("planned");
    // Nothing half-made: the real one then creates both.
    expect((await call("POST", `/api/cycles/${cycle.id}/execute`, {})).body.runs).toHaveLength(2);
  });

  it("a cycle without configurations gets one run; archived ones are skipped", async () => {
    const call = api(await tokenFor());
    const s = await seed(call);
    const plain = (await call("POST", "/api/cycles", { projectId: s.projectId, title: "Plain" })).body;
    await call("POST", `/api/cycles/${plain.id}/items`, { items: [{ testCaseId: s.simple.id }] });
    const one = (await call("POST", `/api/cycles/${plain.id}/execute`, { title: "Again" })).body;
    expect(one.runs.map((r: Payload) => [r.title, r.configurationId])).toEqual([[`${plain.cycleKey} · Again`, null]]);
    const cfg = (await call("POST", "/api/configurations", { projectId: s.projectId, name: "Edge" })).body;
    const withCfg = (await call("POST", "/api/cycles", { projectId: s.projectId, title: "C", configurationIds: [cfg.id] })).body;
    await call("POST", `/api/cycles/${withCfg.id}/items`, { items: [{ testCaseId: s.simple.id }] });
    await call("POST", `/api/configurations/${cfg.id}/archive`, { archived: true });
    expect((await call("POST", `/api/cycles/${withCfg.id}/execute`, {})).body.message).toBe(
      "no-configuration: every configuration of the cycle is archived",
    );
  });

  it("drafts a defect from a failed attempt, without evidence", async () => {
    const call = api(await tokenFor());
    const s = await seed(call);
    await call("POST", "/api/runs", { input: { projectId: s.projectId, title: "M", build: "7", environment: "qa" }, items: [{ testCaseId: s.simple.id }] });
    const [item] = (await docs("run_item")).map((d) => d.entity_id);
    await call("POST", "/api/results", {
      input: {
        runItemId: item,
        attemptId: uuid(1),
        status: "failed",
        errorMessage: "declined",
        steps: [
          { stepId: s.simple.steps[0], text: "open", status: "passed" },
          { stepId: s.simple.steps[1], text: "pay", status: "failed", actual: "card declined" },
        ],
      },
    });
    const run = (await docs("run"))[0];
    const draft = (await call("GET", `/api/results/${uuid(1)}/defect-draft`)).body;
    expect(draft).toMatchObject({
      projectId: s.projectId,
      title: `${s.simple.key} · pay`,
      stepsToReproduce: "1. open\n2. pay",
      actual: "card declined",
      foundInRunId: run.entity_id,
      foundInBuild: "7",
      foundInEnvironment: "qa",
      fromResult: { resultId: uuid(1), stepId: s.simple.steps[1] },
    });
    const asked = (await call("GET", `/api/results/${uuid(1)}/defect-draft?stepId=${s.simple.steps[0]}`)).body;
    expect(asked.title).toBe(`${s.simple.key} · open`);
    expect(asked.actual).toBe("declined");
    expect((await call("GET", `/api/results/${uuid(7)}/defect-draft`)).status).toBe(404);
  });

  it("writes one event for the run, folds its items into one summary", async () => {
    const call = api(await tokenFor());
    const s = await seed(call);
    const before = (await events()).length;
    await call("POST", "/api/runs", { input: { projectId: s.projectId, title: "M" }, items: [{ testCaseId: s.simple.id }, { testCaseId: s.outline.id }] });
    const mine = (await events()).slice(before);
    expect(mine.map((e) => [e.action, e.entity])).toEqual([
      ["create", "run"],
      ["update", "run"],
    ]);
    expect(JSON.parse(mine[1].summary ?? "{}")).toEqual({ itemsAdded: 2 });
  });
});

// ---- interop with the desktop (shared fixture) -----------------------------------------

interface Interop {
  normalize: { keys: string[] };
  project: Payload;
  cases: Payload[];
  run: Payload;
  items: Payload[];
  attempts: { item: number; input: Payload }[];
  documents?: { entity: string; entityId: string; payload: Payload }[];
  pulledOnly: { entity: string; entityId: string; payload: Payload }[];
  views?: { overview: unknown; items: unknown[]; importedResults: unknown[] };
}

const interop = JSON.parse(
  readFileSync(new URL("../../src-tauri/tests/fixtures/web-run-interop.json", import.meta.url), "utf8"),
) as Interop;

/** Ids made by one side become the fixture's names; bookkeeping becomes "*". */
function normalized(value: unknown, names: Map<string, string>): unknown {
  const keys = new Set(interop.normalize.keys);
  const walk = (v: unknown, key?: string): unknown => {
    if (key && keys.has(key) && v !== null && v !== undefined) return "*";
    if (typeof v === "string") return names.get(v) ?? v;
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value);
}

/** The names of what this side made: the run, its items by position, the
 *  step results of each result by position. */
function namesOf(run: { entity_id: string; payload: Payload }, items: { entity_id: string; payload: Payload }[], results: { entity_id: string; payload: Payload }[]) {
  const names = new Map<string, string>([[run.entity_id, "run"]]);
  [...items].sort((a, b) => (a.payload.position as number) - (b.payload.position as number)).forEach((i, n) => names.set(i.entity_id, `item-${n}`));
  for (const r of results) for (const s of r.payload.steps as Payload[]) names.set(s.id as string, `${r.entity_id}:${s.position as number}`);
  return names;
}

const lwwDoc = (entity: string, payload: Payload, hlc: string) => ({
  entity,
  entityId: payload.id as string,
  op: "upsert",
  revision: (payload.revision as number) ?? 1,
  author: "u",
  hlc,
  payload,
});

describe("interop with the desktop (web-run-interop.json)", () => {
  async function pushStart(token: string) {
    const deltas = [
      lwwDoc("project", { ...interop.project, ownerId: "x" }, "000000000000100-00000-desk"),
      ...interop.cases.map((c) => lwwDoc("test_case", { ...c, revision: 1 }, "000000000000101-00000-desk")),
    ];
    const res = await app.inject({ method: "POST", url: "/sync/push", headers: headersOf(token), payload: { deltas } });
    expect(res.statusCode).toBe(200);
  }

  it("what the web writes is what the desktop writes", async () => {
    const token = await tokenFor();
    const call = api(token);
    await pushStart(token);
    const run = (await call("POST", "/api/runs", { input: interop.run, items: interop.items })).body;
    expect(run.id).toBeTruthy();
    const items = (await docs("run_item")).sort((a, b) => (a.payload.position as number) - (b.payload.position as number));
    for (const a of interop.attempts) {
      const res = await call("POST", "/api/results", { input: { ...a.input, runItemId: items[a.item].entity_id } });
      expect(res.status).toBe(200);
    }
    const runDoc = (await docs("run"))[0];
    const results = await docs("result");
    const names = namesOf(runDoc, items, results);
    const written = [
      ...(await docs("test_case_revision")).map((d) => ({ entity: "test_case_revision", entityId: d.entity_id, payload: d.payload })),
      { entity: "run", entityId: runDoc.entity_id, payload: { ...runDoc.payload, startedAt: "*" } },
      ...items.map((d) => ({ entity: "run_item", entityId: d.entity_id, payload: d.payload })),
      ...results.map((d) => ({ entity: "result", entityId: d.entity_id, payload: d.payload })),
    ];
    const got = normalized(written, names);
    if (process.env.DUMP_INTEROP) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(process.env.DUMP_INTEROP, JSON.stringify(got, null, 2));
    }
    const want = (interop.documents ?? []).map((d) => (d.entity === "run" ? { ...d, payload: { ...d.payload, startedAt: "*" } } : d));
    expect(got).toEqual(normalized(want, new Map()));
  });

  it("what the desktop wrote reads on the web as on the desktop", async () => {
    const token = await tokenFor();
    await pushStart(token);
    const deltas = [...(interop.documents ?? []), ...interop.pulledOnly].map((d, n) =>
      d.entity === "result" || d.entity === "test_case_revision" || d.entity === "run_shard"
        ? { entity: d.entity, entityId: d.entityId, op: "append", revision: 1, author: "u", hlc: d.payload.hlc as string, payload: d.payload }
        : lwwDoc(d.entity, d.payload, `000000000000${String(200 + n)}-00000-desk`),
    );
    const res = await app.inject({ method: "POST", url: "/sync/push", headers: headersOf(token), payload: { deltas } });
    expect(res.statusCode).toBe(200);
    const call = api(token);
    const overview = (await call("GET", "/api/runs/run/overview")).body;
    const details = [];
    for (const n of interop.items.keys()) details.push((await call("GET", `/api/run-items/item-${n}`)).body);
    // An imported run, written only by the desktop, reads the same too.
    const importedResults = (await call("GET", "/api/runs/run-imp/results")).body;
    const got = normalized(
      { overview: { ...overview, run: { ...overview.run, startedAt: "*" } }, items: details, importedResults },
      new Map(),
    );
    if (process.env.DUMP_INTEROP) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(`${process.env.DUMP_INTEROP}.views.json`, JSON.stringify(got, null, 2));
    }
    expect(got).toEqual(normalized(interop.views, new Map()));
  });
});
