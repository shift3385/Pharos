import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { verifyChain, type AuditEvent } from "../src/modules/audit/audit.chain";

// Web edits are audited (AUD-01b, ADR-0015): every domain write leaves one
// `audit_event` in the same transaction, linked into the user's web chain
// ("web", "web", user), which desktops with `append-only` pull and verify.

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

async function register(email = "audit@pharos.dev"): Promise<{ token: string; userId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "W", firstName: "A", lastName: "B" },
  });
  const body = res.json();
  return { token: body.accessToken as string, userId: body.user.id as string };
}

const headers = (token: string, features = "key-conflicts") => ({
  authorization: `Bearer ${token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: features,
});
const DESKTOP = "key-conflicts,append-only,complete-payload,stable-steps";

type Method = "GET" | "POST" | "PUT" | "DELETE";
async function call(token: string, method: Method, url: string, payload?: unknown) {
  const res = await app.inject({ method, url, headers: headers(token), payload: payload as object });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}

/** The user's web chain, in order, as stored. */
async function chain(userId: string): Promise<AuditEvent[]> {
  const { rows } = await pool.query<{ payload: AuditEvent }>(
    `SELECT payload FROM documents WHERE user_id = $1 AND entity = 'audit_event'
      ORDER BY (payload->>'chainSeq')::bigint`,
    [userId],
  );
  return rows.map((r) => r.payload);
}

const changesOf = (e: AuditEvent) => JSON.parse(e.changes!) as Record<string, [unknown, unknown]>;

async function newProject(token: string, name = "Checkout") {
  const res = await call(token, "POST", "/api/projects", { name });
  expect(res.status).toBe(200);
  return res.body as { id: string; revision: number };
}

const caseInput = (projectId: string, title = "Login") => ({ projectId, title, author: "QA", data: { steps: ["open"] } });

describe("web audit (AUD-01b)", () => {
  it("one event per create, update and delete, linked into the user's web chain", async () => {
    const { token, userId } = await register();
    const p = await newProject(token);
    const c = (await call(token, "POST", "/api/test-cases", caseInput(p.id))).body;
    const updated = await call(token, "PUT", `/api/test-cases/${c.id}`, {
      // The editor sends back the step it read (with its id) and a new one.
      input: { ...caseInput(p.id, "Logout"), data: { steps: [c.data.steps[0], "close"] } },
      revision: c.revision,
    });
    expect(updated.status).toBe(200);
    expect((await call(token, "DELETE", `/api/test-cases/${c.id}?revision=${updated.body.revision}`)).status).toBe(204);

    const events = await chain(userId);
    expect(events.map((e) => `${e.action} ${e.entity}`)).toEqual([
      "create project",
      "create test_case",
      "update test_case",
      "delete test_case",
    ]);
    for (const e of events) {
      expect(e).toMatchObject({
        deviceId: "web",
        chainWorkspaceId: "web",
        chainOwner: userId,
        actor: `user:${userId}`,
        onBehalfOf: null,
        origin: "local",
        workspaceId: "",
        projectId: p.id,
        redactedAt: null,
      });
      expect(e.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    expect(events[1]).toMatchObject({ entityId: c.id, entityKey: "ATS_001" });
    expect(changesOf(events[1])).toMatchObject({ title: [null, "Login"], scenarioId: [null, "ATS_001"], deleted: [null, false] });
    // Steps carry stable ids (DAT-02): the kept one keeps its id.
    const steps = changesOf(events[2])["data.steps"] as { id: string; text: string }[][];
    expect(Object.keys(changesOf(events[2])).sort()).toEqual(["data.steps", "title"]);
    expect(changesOf(events[2]).title).toEqual(["Login", "Logout"]);
    expect(steps.map((list) => list.map((s) => s.text))).toEqual([["open"], ["open", "close"]]);
    expect(steps[1][0].id).toBe(steps[0][0].id);
    expect(changesOf(events[3])).toMatchObject({ title: ["Logout", null], deleted: [false, null] });
    expect(verifyChain(events)).toEqual({ ok: true, count: 4 });
    // Stamped after the change it records.
    const doc = await pool.query<{ hlc: string }>(
      "SELECT hlc FROM documents WHERE user_id = $1 AND entity = 'test_case'",
      [userId],
    );
    expect(events[3].hlc > doc.rows[0].hlc).toBe(true);
  });

  it("covers plans, requirements, planner cards and defects too", async () => {
    const { token, userId } = await register();
    const p = await newProject(token);
    const plan = (await call(token, "POST", "/api/test-plans", { projectId: p.id, title: "Plan", data: {} })).body;
    await call(token, "PUT", `/api/test-plans/${plan.id}`, { input: { projectId: p.id, title: "Plan 2", data: {} } });
    const req = (await call(token, "POST", "/api/requirements", { projectId: p.id, title: "Pay" })).body;
    await call(token, "PUT", `/api/requirements/${req.id}`, { input: { projectId: p.id, title: "Pay fast" } });
    const card = (await call(token, "POST", "/api/planner-cards", { projectId: p.id, kind: "task", title: "Do", data: {} })).body;
    await call(token, "PUT", `/api/planner-cards/${card.id}`, { input: { projectId: p.id, kind: "task", title: "Do 2", data: {} } });
    const bug = (await call(token, "POST", "/api/defects", { projectId: p.id, title: "Bug", data: {} })).body;
    await call(token, "POST", `/api/defects/${bug.id}/transition`, { status: "open" });
    await call(token, "POST", `/api/defects/${bug.id}/links`, {
      target: { targetKind: "requirement", targetId: req.id },
      linked: true,
    });
    await call(token, "PUT", `/api/projects/${p.id}`, { input: { name: "Checkout 2" } });

    const events = await chain(userId);
    expect(events.map((e) => `${e.action} ${e.entity} ${e.entityKey ?? "-"}`)).toEqual([
      "create project -",
      "create test_plan -",
      "update test_plan -",
      "create requirement REQ-001",
      "update requirement REQ-001",
      "create planner_card -",
      "update planner_card -",
      "create defect DEF-001",
      "update defect DEF-001",
      "link defect DEF-001",
      "update project -",
    ]);
    expect(changesOf(events[8])).toEqual({ status: ["new", "open"] });
    expect(changesOf(events[10])).toEqual({ name: ["Checkout", "Checkout 2"] });
    expect(verifyChain(events).ok).toBe(true);
  });

  it("no event for an update that changes nothing, nor for a refused write", async () => {
    const { token, userId } = await register();
    const p = await newProject(token);
    const c = (await call(token, "POST", "/api/test-cases", caseInput(p.id))).body;
    const before = (await chain(userId)).length;

    // The same content again (what the editor read, step ids included): a new
    // revision for the devices, no event.
    const same = await call(token, "PUT", `/api/test-cases/${c.id}`, {
      input: { ...caseInput(p.id), data: c.data },
      revision: c.revision,
    });
    expect(same.status).toBe(200);
    expect(same.body.revision).toBe(c.revision + 1);
    // Stale revision (409), a taken key (409), not found (404).
    expect((await call(token, "PUT", `/api/test-cases/${c.id}`, { input: caseInput(p.id, "X"), revision: c.revision })).status).toBe(409);
    expect((await call(token, "POST", "/api/test-cases", { ...caseInput(p.id), scenarioId: "ATS_001" })).status).toBe(409);
    expect((await call(token, "PUT", "/api/test-cases/nope", { input: caseInput(p.id) })).status).toBe(404);
    // Deleted elsewhere (409).
    await call(token, "DELETE", `/api/test-cases/${c.id}`);
    const deletedBefore = (await chain(userId)).length;
    expect((await call(token, "PUT", `/api/test-cases/${c.id}`, { input: caseInput(p.id, "Y"), revision: 2 })).status).toBe(409);

    const events = await chain(userId);
    expect(deletedBefore).toBe(before + 1);
    expect(events.length).toBe(before + 1);
    expect(verifyChain(events).ok).toBe(true);
  });

  it("an import is one event with its counts; its rows have none", async () => {
    const { token, userId } = await register();
    const p = await newProject(token);
    await call(token, "POST", "/api/requirements", { projectId: p.id, title: "Old", requirementKey: "R-1" });
    const gone = (await call(token, "POST", "/api/requirements", { projectId: p.id, title: "Gone", requirementKey: "R-9" })).body;
    await call(token, "DELETE", `/api/requirements/${gone.id}`);
    const before = (await chain(userId)).length;

    const res = await call(token, "POST", `/api/requirements/import?projectId=${p.id}`, {
      rows: [
        { requirementKey: "R-1", title: "Old, updated" },
        { requirementKey: "R-2", title: "New" },
        { title: "Numbered" },
        { requirementKey: "R-9", title: "Retired key" },
      ],
    });
    expect(res.body).toEqual({ created: 2, updated: 1, skipped: ["R-9"] });

    const events = (await chain(userId)).slice(before);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "import", entity: "project", entityId: p.id, projectId: p.id, changes: "{}" });
    expect(JSON.parse(events[0].summary!)).toEqual({ entity: "requirement", format: "csv", rows: 4, created: 2, updated: 1, skipped: 1 });
  });

  it("a reorder writes one event per card that moved, none for the others", async () => {
    const { token, userId } = await register();
    const p = await newProject(token);
    const card = async (title: string) =>
      (await call(token, "POST", "/api/planner-cards", { projectId: p.id, kind: "task", title, data: {} })).body.id as string;
    const [a, b, c] = [await card("a"), await card("b"), await card("c")];
    const before = (await chain(userId)).length;
    // a stays at 0; c and b swap.
    await app.inject({
      method: "POST",
      url: "/api/planner-cards/reorder",
      headers: headers(token),
      payload: { status: "backlog", ids: [a, c, b] },
    });
    const events = (await chain(userId)).slice(before);
    expect(events.map((e) => [e.entityId, changesOf(e)])).toEqual([
      [c, { position: [2, 1] }],
      [b, { position: [1, 2] }],
    ]);
  });

  it("a project delete is one event with its cascade; its children get none", async () => {
    const { token, userId } = await register();
    const p = await newProject(token);
    await call(token, "POST", "/api/test-cases", caseInput(p.id));
    await call(token, "POST", "/api/test-cases", caseInput(p.id, "Two"));
    await call(token, "POST", "/api/requirements", { projectId: p.id, title: "Pay" });
    const before = (await chain(userId)).length;
    expect((await call(token, "DELETE", `/api/projects/${p.id}`)).status).toBe(204);

    const events = (await chain(userId)).slice(before);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "delete", entity: "project", entityId: p.id });
    expect(JSON.parse(events[0].summary!)).toEqual({
      cascade: {
        custom_fields: 0,
        planner_cards: 0,
        requirements: 1,
        test_cases: 2,
        test_plans: 0,
        runs: 0,
        run_items: 0,
        unlinked_mappings: 0,
        configurations: 0,
        test_cycles: 0,
        test_cycle_items: 0,
        defects: 0,
        defect_links: 0,
      },
    });
    expect(changesOf(events[0])).toMatchObject({ name: ["Checkout", null] });
    // The events themselves are not children: the delete leaves them live.
    const { rows } = await pool.query("SELECT 1 FROM documents WHERE entity = 'audit_event' AND deleted");
    expect(rows).toHaveLength(0);
  });

  it("the chain stays contiguous under concurrent writes of the same user", async () => {
    const { token, userId } = await register();
    const p = await newProject(token);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => call(token, "POST", "/api/test-cases", caseInput(p.id, `Case ${i}`))),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const events = await chain(userId);
    expect(events.map((e) => e.chainSeq)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(verifyChain(events)).toEqual({ ok: true, count: 21 });
    const head = await pool.query("SELECT seq, hash FROM audit_chain_heads WHERE user_id = $1", [userId]);
    expect(head.rows).toEqual([{ seq: "21", hash: events[20].hash }]);
  });

  it("a missing head row continues the chain from the last stored event", async () => {
    const { token, userId } = await register();
    const p = await newProject(token);
    await call(token, "PUT", `/api/projects/${p.id}`, { input: { name: "Renamed" } });
    await pool.query("DELETE FROM audit_chain_heads WHERE user_id = $1", [userId]);
    await call(token, "PUT", `/api/projects/${p.id}`, { input: { name: "Again" } });
    const events = await chain(userId);
    expect(events.map((e) => e.chainSeq)).toEqual([1, 2, 3]);
    expect(verifyChain(events)).toEqual({ ok: true, count: 3 });
    const head = await pool.query("SELECT seq FROM audit_chain_heads WHERE user_id = $1", [userId]);
    expect(head.rows).toEqual([{ seq: "3" }]);
  });

  it("a failure writing the event rolls back the change and the event", async () => {
    const { token, userId } = await register();
    const p = await newProject(token);
    await pool.query(`CREATE FUNCTION audit_test_fail() RETURNS trigger LANGUAGE plpgsql AS
      $fail$ BEGIN RAISE EXCEPTION 'audit head refused (test)'; END $fail$`);
    await pool.query(`CREATE TRIGGER audit_test_fail BEFORE INSERT OR UPDATE ON audit_chain_heads
      FOR EACH ROW EXECUTE FUNCTION audit_test_fail()`);
    try {
      const res = await call(token, "PUT", `/api/projects/${p.id}`, { input: { name: "Lost" } });
      expect(res.status).toBe(500);
    } finally {
      await pool.query("DROP TRIGGER audit_test_fail ON audit_chain_heads");
      await pool.query("DROP FUNCTION audit_test_fail()");
    }
    const stored = (await call(token, "GET", `/api/projects/${p.id}`)).body;
    expect(stored).toMatchObject({ name: "Checkout", revision: 1 });
    expect((await chain(userId)).map((e) => e.action)).toEqual(["create"]);
  });

  it("two users have separate chains", async () => {
    const a = await register("a@pharos.dev");
    const b = await register("b@pharos.dev");
    await newProject(a.token);
    await newProject(b.token);
    await newProject(a.token);
    expect((await chain(a.userId)).map((e) => e.chainSeq)).toEqual([1, 2]);
    expect((await chain(b.userId)).map((e) => [e.chainSeq, e.chainOwner])).toEqual([[1, b.userId]]);
  });

  it("a tampered copy in the store is told apart by the verifier", async () => {
    const { token, userId } = await register();
    const p = await newProject(token);
    await call(token, "PUT", `/api/projects/${p.id}`, { input: { name: "Renamed" } });
    await call(token, "PUT", `/api/projects/${p.id}`, { input: { name: "Again" } });
    await pool.query(
      `UPDATE documents SET payload = jsonb_set(payload, '{changes}', to_jsonb('{"name":["Checkout","Hacked"]}'::text))
        WHERE user_id = $1 AND entity = 'audit_event' AND payload->>'chainSeq' = '2'`,
      [userId],
    );
    expect(verifyChain(await chain(userId))).toEqual({ ok: false, break: { kind: "changes", seq: 2 } });
  });

  it("only clients with append-only pull web events, and they have the shared fixture's shape", async () => {
    const { token, userId } = await register();
    await newProject(token);
    const old = await app.inject({ method: "GET", url: "/sync/pull?since=0", headers: headers(token) });
    expect(old.json().docs.map((d: { entity: string }) => d.entity)).toEqual(["project"]);

    const res = await app.inject({ method: "GET", url: "/sync/pull?since=0", headers: headers(token, DESKTOP) });
    const docs = res.json().docs as Record<string, unknown>[];
    const pulled = docs.find((d) => d.entity === "audit_event")!;
    expect(pulled).toMatchObject({ revision: 1, deleted: false, author: `user:${userId}` });
    const fixture = JSON.parse(
      readFileSync(new URL("../../src/shared/contracts/fixtures/audit/chain.json", import.meta.url), "utf8"),
    ) as { docs: Record<string, Record<string, unknown>>[] };
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(pulled)).toEqual(keys(fixture.docs[0]));
    expect(keys(pulled.payload as object)).toEqual(keys(fixture.docs[0].payload));
  });

  it("/sync/push is not audited, and a pushed event may not claim the web chain", async () => {
    const { token, userId } = await register();
    const push = (deltas: unknown[]) =>
      app.inject({ method: "POST", url: "/sync/push", headers: headers(token, DESKTOP), payload: { deltas } });
    const res = await push([
      {
        entity: "project",
        entityId: "p-desk",
        op: "upsert",
        revision: 1,
        hlc: "000000000000100-00000-desk",
        payload: { id: "p-desk", name: "From the desktop" },
      },
      {
        entity: "audit_event",
        entityId: "forged",
        op: "append",
        revision: 1,
        hlc: "000000000000101-00000-desk",
        payload: { id: "forged", deviceId: "web", chainWorkspaceId: "web", chainOwner: userId, chainSeq: 1 },
      },
    ]);
    expect(res.statusCode).toBe(200);
    expect(res.json().appendRejected).toEqual([{ entity: "audit_event", entityId: "forged", reason: "reserved_chain" }]);
    expect(await chain(userId)).toEqual([]);
    const head = await pool.query("SELECT 1 FROM audit_chain_heads WHERE user_id = $1", [userId]);
    expect(head.rows).toHaveLength(0);
  });
});
