import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { createServerClock, parseHlc } from "../src/modules/sync/sync.hlc";

// The web's domain API (BASE-10, ADR-0004): the server applies the desktop's
// rules to the document store, and the devices pull the result.

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

async function tokenFor(email = "web@pharos.dev"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "W", firstName: "A", lastName: "B" },
  });
  return res.json().accessToken as string;
}

const headers = (token: string) => ({
  authorization: `Bearer ${token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: "key-conflicts",
});

type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
async function call(token: string, method: Method, url: string, payload?: unknown) {
  const res = await app.inject({ method, url, headers: headers(token), payload: payload as object });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}

async function project(token: string, name = "Checkout", extra: object = {}) {
  const res = await call(token, "POST", "/api/projects", { name, ...extra });
  expect(res.status).toBe(200);
  return res.body as { id: string; revision: number };
}

const caseInput = (projectId: string, title = "Login", extra: object = {}) => ({
  projectId,
  title,
  author: "QA",
  data: { steps: ["open"] },
  ...extra,
});

async function pull(token: string) {
  return (await call(token, "GET", "/sync/pull?since=0")).body.docs as {
    entity: string;
    entityId: string;
    deleted: boolean;
    revision: number;
    hlc: string;
    payload: Record<string, unknown>;
  }[];
}

describe("domain API", () => {
  it("needs a session and a supported version", async () => {
    expect((await app.inject({ method: "GET", url: "/api/projects" })).statusCode).toBe(401);
    const token = await tokenFor();
    const old = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { authorization: `Bearer ${token}`, [VERSION_HEADER]: "9.0.0" },
    });
    expect(old.statusCode).toBe(426);
  });

  it("creates, lists, updates and deletes a project, and the devices pull it", async () => {
    const token = await tokenFor();
    const p = await project(token, "Zeta");
    await project(token, "alpha");
    const list = (await call(token, "GET", "/api/projects")).body as { name: string }[];
    expect(list.map((x) => x.name)).toEqual(["alpha", "Zeta"]);

    const got = (await call(token, "GET", `/api/projects/${p.id}`)).body;
    expect(got).toMatchObject({ name: "Zeta", caseIdPrefix: "ATS_", caseIdDigits: 3, revision: 1 });

    const upd = await call(token, "PUT", `/api/projects/${p.id}`, { input: { name: "Zeta 2" }, revision: 1 });
    expect(upd.body).toMatchObject({ name: "Zeta 2", revision: 2 });

    const docs = await pull(token);
    const doc = docs.find((d) => d.entityId === p.id)!;
    expect(doc).toMatchObject({ entity: "project", revision: 2, deleted: false });
    expect(doc.payload).toMatchObject({ name: "Zeta 2", revision: 2 });
    expect(parseHlc(doc.hlc)?.deviceId).toBe("server");

    expect((await call(token, "DELETE", `/api/projects/${p.id}?revision=2`)).status).toBe(204);
    expect((await call(token, "GET", `/api/projects/${p.id}`)).body).toBeNull();
  });

  it("another account neither reads nor changes my items", async () => {
    const mine = await tokenFor("a@pharos.dev");
    const other = await tokenFor("b@pharos.dev");
    const p = await project(mine);
    const c = (await call(mine, "POST", "/api/test-cases", caseInput(p.id))).body;
    expect((await call(other, "GET", "/api/projects")).body).toEqual([]);
    expect((await call(other, "GET", `/api/test-cases/${c.id}`)).body).toBeNull();
    expect((await call(other, "PUT", `/api/test-cases/${c.id}`, { input: caseInput(p.id) })).status).toBe(404);
    expect((await call(other, "POST", "/api/test-cases", caseInput(p.id))).status).toBe(404);
    expect((await call(other, "DELETE", `/api/projects/${p.id}`)).status).toBe(404);
  });

  it("refuses a write based on an old revision and returns the current version", async () => {
    const token = await tokenFor();
    const p = await project(token);
    await call(token, "PUT", `/api/projects/${p.id}`, { input: { name: "Elsewhere" }, revision: 1 });
    const stale = await call(token, "PUT", `/api/projects/${p.id}`, { input: { name: "Mine" }, revision: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: "stale_write", current: { name: "Elsewhere", revision: 2 } });
    const gone = await call(token, "DELETE", `/api/projects/${p.id}?revision=1`);
    expect(gone.status).toBe(409);
  });

  it("a web write wins over the version it replaced, by HLC", async () => {
    const token = await tokenFor();
    const future = "999999999999999-00000-desk";
    await call(token, "POST", "/sync/push", {
      deltas: [{ entity: "project", entityId: "p1", op: "upsert", payload: { id: "p1", name: "Desk" }, hlc: future }],
    });
    const upd = await call(token, "PUT", "/api/projects/p1", { input: { name: "Web" }, revision: 1 });
    expect(upd.status).toBe(200);
    const doc = (await pull(token)).find((d) => d.entityId === "p1")!;
    expect(doc.hlc > future).toBe(true);
    expect(doc.payload.name).toBe("Web");
  });

  it("numbers cases from the project's series and never reuses a key", async () => {
    const token = await tokenFor();
    const p = await project(token, "Shop", { caseIdPrefix: "TC-", caseIdDigits: 4 });
    const a = (await call(token, "POST", "/api/test-cases", caseInput(p.id, "A"))).body;
    const b = (await call(token, "POST", "/api/test-cases", caseInput(p.id, "B"))).body;
    expect([a.scenarioId, b.scenarioId]).toEqual(["TC-0001", "TC-0002"]);

    await call(token, "DELETE", `/api/test-cases/${b.id}`);
    const c = (await call(token, "POST", "/api/test-cases", caseInput(p.id, "C"))).body;
    expect(c.scenarioId).toBe("TC-0003");

    const typed = await call(token, "POST", "/api/test-cases", caseInput(p.id, "D", { scenarioId: "TC-0001" }));
    expect(typed).toMatchObject({ status: 409, body: { code: "key_taken" } });
    const retired = await call(token, "POST", "/api/test-cases", caseInput(p.id, "E", { scenarioId: "TC-0002" }));
    expect(retired).toMatchObject({ status: 409, body: { code: "key_retired" } });
    const provisional = await call(token, "POST", "/api/test-cases", caseInput(p.id, "F", { scenarioId: "TC-?AB" }));
    expect(provisional.body.code).toBe("invalid_key");

    // A typed key above the series moves the series past it.
    await call(token, "POST", "/api/test-cases", caseInput(p.id, "G", { scenarioId: "TC-0040" }));
    expect((await call(token, "POST", "/api/test-cases", caseInput(p.id, "H"))).body.scenarioId).toBe("TC-0041");
  });

  it("keeps a case's key on update and lists summaries", async () => {
    const token = await tokenFor();
    const p = await project(token);
    const c = (await call(token, "POST", "/api/test-cases", caseInput(p.id))).body;
    const data = { gherkinLevel: "outline", aiProvenance: { title: { reviewedAt: null } } };
    const upd = await call(token, "PUT", `/api/test-cases/${c.id}`, {
      input: caseInput(p.id, "Login v2", { scenarioId: "OTHER", data }),
      revision: 1,
    });
    expect(upd.body).toMatchObject({ scenarioId: "ATS_001", title: "Login v2", version: "1.0", revision: 2 });
    const list = (await call(token, "GET", `/api/test-cases?projectId=${p.id}`)).body;
    expect(list).toEqual([
      expect.objectContaining({ scenarioId: "ATS_001", gherkinLevel: "outline", aiPending: true, revision: 2 }),
    ]);
  });

  it("does not hand out a number a device already leased", async () => {
    const token = await tokenFor();
    const p = await project(token);
    const lease = await call(token, "POST", "/sync/key-blocks", { requests: [{ projectId: p.id, kind: "case" }] });
    expect(lease.body.blocks[0]).toMatchObject({ start: 1, end: 50 });
    expect((await call(token, "POST", "/api/test-cases", caseInput(p.id))).body.scenarioId).toBe("ATS_051");
  });

  it("a project delete removes its children for every device (FIX-05)", async () => {
    const token = await tokenFor();
    const p = await project(token);
    const c = (await call(token, "POST", "/api/test-cases", caseInput(p.id))).body;
    const plan = (
      await call(token, "POST", "/api/test-plans", { projectId: p.id, title: "Plan", author: "QA", data: {} })
    ).body;
    await call(token, "DELETE", `/api/projects/${p.id}`);
    const docs = await pull(token);
    for (const id of [c.id, plan.id]) expect(docs.find((d) => d.entityId === id)?.deleted).toBe(true);
    expect((await call(token, "GET", `/api/test-cases?projectId=${p.id}`)).body).toEqual([]);
  });

  it("test plans: newest first, by project, and only through a live project", async () => {
    const token = await tokenFor();
    const p = await project(token);
    const input = { projectId: p.id, title: "Plan A", author: "QA", data: { scope: "x" } };
    const a = (await call(token, "POST", "/api/test-plans", input)).body;
    const b = (await call(token, "POST", "/api/test-plans", { ...input, title: "Plan B" })).body;
    expect(a).toMatchObject({ version: "1.0", status: "draft", planDate: null, revision: 1 });
    expect((await call(token, "GET", "/api/test-plans")).body.map((x: { id: string }) => x.id)).toEqual([b.id, a.id]);
    expect((await call(token, "GET", `/api/test-plans?projectId=${p.id}`)).body.id).toBe(b.id);
    const upd = await call(token, "PUT", `/api/test-plans/${a.id}`, { input: { ...input, title: "A2" }, revision: 1 });
    expect(upd.body).toMatchObject({ title: "A2", revision: 2 });
    expect((await call(token, "POST", "/api/test-plans", { ...input, projectId: "nope" })).status).toBe(404);
  });

  it("requirements: numbering, immutable keys and upsert-by-key import", async () => {
    const token = await tokenFor();
    const p = await project(token);
    const r1 = (await call(token, "POST", "/api/requirements", { projectId: p.id, title: " Pay " })).body;
    expect(r1).toMatchObject({ requirementKey: "REQ-001", title: "Pay", priority: "medium", description: "" });
    const bad = await call(token, "POST", "/api/requirements", { projectId: p.id, title: "x", requirementKey: "a b" });
    expect(bad.body.code).toBe("invalid_key");
    const r2 = (await call(token, "POST", "/api/requirements", { projectId: p.id, title: "Ship" })).body;
    const upd = await call(token, "PUT", `/api/requirements/${r1.id}`, {
      input: { projectId: p.id, title: "Pay v2", requirementKey: "REQ-900", priority: "high" },
      revision: 1,
    });
    expect(upd.body).toMatchObject({ requirementKey: "REQ-001", title: "Pay v2", priority: "high" });
    await call(token, "DELETE", `/api/requirements/${r2.id}`);

    const imported = await call(token, "POST", `/api/requirements/import?projectId=${p.id}`, {
      rows: [
        { requirementKey: "REQ-001", title: "Pay v3" },
        { requirementKey: "REQ-002", title: "Back from the dead" },
        { title: "New one" },
        { title: "  " },
      ],
    });
    expect(imported.body).toEqual({ created: 1, updated: 1, skipped: ["REQ-002"] });
    const list = (await call(token, "GET", `/api/requirements?projectId=${p.id}`)).body;
    expect(list.map((r: { requirementKey: string; title: string }) => [r.requirementKey, r.title])).toEqual([
      ["REQ-001", "Pay v3"],
      ["REQ-003", "New one"],
    ]);
  });

  it("planner cards: positions per column, defect keys kept, reorder", async () => {
    const token = await tokenFor();
    const p = await project(token);
    const card = (input: object) =>
      call(token, "POST", "/api/planner-cards", { projectId: p.id, kind: "task", title: "T", data: {}, ...input });
    const t1 = (await card({})).body;
    const t2 = (await card({})).body;
    const d1 = (await card({ kind: "defect", status: "todo" })).body;
    expect([t1.position, t2.position, d1.position]).toEqual([0, 1, 0]);
    expect([t1.cardKey, d1.cardKey]).toEqual([null, "DEF-001"]);

    const asDefect = await call(token, "PUT", `/api/planner-cards/${t1.id}`, {
      input: { projectId: p.id, kind: "defect", title: "Now a defect", data: {} },
      revision: 1,
    });
    expect(asDefect.body.cardKey).toBe("DEF-002");
    const back = await call(token, "PUT", `/api/planner-cards/${t1.id}`, {
      input: { projectId: p.id, kind: "task", title: "Task again", data: {} },
    });
    expect(back.body.cardKey).toBe("DEF-002");

    expect((await call(token, "POST", "/api/planner-cards/reorder", { status: "done", ids: [t2.id, t1.id, "x"] })).status).toBe(
      204,
    );
    const list = (await call(token, "GET", `/api/planner-cards?projectId=${p.id}`)).body;
    expect(list.map((c: { id: string; status: string; position: number }) => [c.id, c.status, c.position])).toEqual([
      // Same position: the older card first (`planner.rs`).
      [t2.id, "done", 0],
      [d1.id, "todo", 0],
      [t1.id, "done", 1],
    ]);
  });

  it("edits the profile names but not the role", async () => {
    const token = await tokenFor();
    const res = await call(token, "PATCH", "/auth/me", {
      displayName: "Ana",
      firstName: "Ana",
      lastName: "Pérez",
      role: "admin",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ displayName: "Ana", lastName: "Pérez", role: "test_manager" });
    expect((await call(token, "PATCH", "/auth/me", { displayName: "", firstName: "A", lastName: "B" })).status).toBe(400);
  });
});

describe("server clock", () => {
  it("stamps after its last stamp and after the version it replaces", () => {
    const clock = createServerClock("server", () => 1000);
    const a = clock.stamp();
    const b = clock.stamp();
    expect(b > a).toBe(true);
    const ahead = "000000000005000-00007-desk";
    expect(clock.stamp(ahead) > ahead).toBe(true);
  });
});
