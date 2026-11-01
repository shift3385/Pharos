// Defects on the server (DEF-01, ADR-0016): `defect` and `defect_link` are
// lww and only for clients with the `defects` feature; a client without it
// can no longer touch a planner defect card; a project delete takes them;
// migration 0010 converts the stored cards with the desktop's function.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { runMigrations } from "../src/db/migrate";
import { convertPlannerDefects, fromCard, linkId, transitionAllowed, DEFECT_STATUSES } from "../src/modules/sync/defects";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";

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

async function register(email = "defects@pharos.dev"): Promise<{ token: string; userId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "S", firstName: "A", lastName: "B" },
  });
  return { token: res.json().accessToken as string, userId: res.json().user.id as string };
}

type Headers = Record<string, string>;
const withFeatures = (token: string, features: string): Headers => ({
  authorization: `Bearer ${token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: features,
});
const ALL = "key-conflicts,append-only,complete-payload,stable-steps,runs,custom-fields";
/** This build, and a build of the same minor before DEF-01. */
const current = (t: string) => withFeatures(t, `${ALL},defects`);
const beforeDefects = (t: string) => withFeatures(t, ALL);

const H = (wall: number, device = "desk") => `${String(wall).padStart(15, "0")}-00000-${device}`;
const lww = (entity: string, id: string, payload: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  entity,
  entityId: id,
  op: "upsert",
  revision: 1,
  author: "u",
  hlc: H(100),
  payload: { id, ...payload },
  ...over,
});
const project = () => lww("project", "p1", { name: "Checkout", ownerId: "x", caseIdPrefix: "TC-", caseIdDigits: 3 });
const defect = (id = "d1", over: Record<string, unknown> = {}) =>
  lww("defect", id, {
    projectId: "p1",
    defectKey: "DEF-001",
    title: "Bug",
    severity: "major",
    priority: "medium",
    status: "new",
    resolution: null,
    data: {},
    ...over,
  });
const link = (defectId = "d1", caseId = "c1") =>
  lww("defect_link", linkId(defectId, "test_case", caseId), {
    projectId: "p1",
    defectId,
    targetKind: "test_case",
    targetId: caseId,
  });
const card = (id: string, kind: string, over: Record<string, unknown> = {}) =>
  lww("planner_card", id, { projectId: "p1", ownerId: "x", kind, title: "C", status: "backlog", data: {}, ...over });

const push = (headers: Headers, deltas: unknown[]) =>
  app.inject({ method: "POST", url: "/sync/push", headers, payload: { deltas } });
const pull = async (headers: Headers, since = 0) =>
  (await app.inject({ method: "GET", url: `/sync/pull?since=${since}`, headers })).json();
const entities = (docs: { entity: string }[]) => [...new Set(docs.map((d) => d.entity))].sort();

const VECTORS = JSON.parse(
  readFileSync(new URL("../../src-tauri/tests/fixtures/defect-vectors.json", import.meta.url), "utf8"),
);

describe("defect conversion and ids (shared vectors)", () => {
  it("convert cards and derive link ids as the desktop does", () => {
    for (const x of VECTORS.cards) {
      const { defect, links } = fromCard(x.card);
      expect(defect).toEqual(x.defect);
      expect(links).toEqual(x.links);
    }
    for (const x of VECTORS.linkIds) expect(linkId(x.defectId, x.targetKind, x.targetId)).toBe(x.id);
    for (const from of DEFECT_STATUSES)
      for (const to of DEFECT_STATUSES)
        expect(transitionAllowed(from, to), `${from} → ${to}`).toBe(
          from === to || (VECTORS.transitions[from] as string[]).includes(to),
        );
  });
});

describe("defects feature", () => {
  it("is listed in the server features", () => {
    expect(SERVER_FEATURES).toContain("defects");
  });

  it("travels to clients with it, and never to the others", async () => {
    const { token } = await register();
    const res = await push(current(token), [project(), defect(), link()]);
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(3);
    expect(entities((await pull(current(token))).docs)).toEqual(["defect", "defect_link", "project"]);
    expect(entities((await pull(beforeDefects(token))).docs)).toEqual(["project"]);
  });

  it("refuses a push of a client without it that touches a defect", async () => {
    const { token } = await register();
    await push(current(token), [project(), card("k-task", "task"), defect()]);
    // Stored as a defect card by a build before 0010 (raw, as old data is).
    await pool.query(
      `UPDATE documents SET entity = 'planner_card', payload = payload || '{"kind":"defect"}'
        WHERE entity = 'defect' AND entity_id = 'd1'`,
    );
    for (const deltas of [
      [defect("d2")],
      [link()],
      [card("k-new", "defect")],
      [{ ...card("d1", "task"), op: "delete", payload: {} }],
    ]) {
      const res = await push(beforeDefects(token), deltas);
      expect(res.statusCode, JSON.stringify(deltas)).toBe(400);
      expect(res.json().code).toBe("defects_unsupported");
    }
    // A task card from the same client is fine.
    expect((await push(beforeDefects(token), [card("k-task", "task", { title: "T2" }), { ...card("k-x", "test_data") }])).statusCode).toBe(200);
  });

  it("hides the planner defect cards from clients without it", async () => {
    const { token, userId } = await register();
    await push(current(token), [project()]);
    await pool.query(
      `INSERT INTO documents (user_id, entity, entity_id, payload, revision, author, deleted, hlc)
       VALUES ($1, 'planner_card', 'k1', '{"id":"k1","projectId":"p1","kind":"defect","cardKey":"DEF-001"}', 2, 'u', true, $2)`,
      [userId, H(50)],
    );
    expect(entities((await pull(beforeDefects(token))).docs)).toEqual(["project"]);
    expect(entities((await pull(current(token))).docs)).toEqual(["planner_card", "project"]);
  });

  it("validates defect documents and link ids", async () => {
    const { token } = await register();
    await push(current(token), [project()]);
    for (const bad of [
      defect("d1", { severity: "blocker" }),
      defect("d1", { status: "done" }),
      defect("d1", { title: "" }),
      defect("d1", { resolution: "maybe" }),
      { ...link(), entityId: "not-derived" },
      lww("defect_link", "x", { projectId: "p1", defectId: "d1", targetKind: "bug", targetId: "c1" }),
    ]) {
      expect((await push(current(token), [bad])).statusCode, JSON.stringify(bad)).toBe(400);
    }
  });

  it("answers a defect key another live defect holds with a key conflict", async () => {
    const { token } = await register();
    await push(current(token), [project(), defect("d1")]);
    const res = await push(current(token), [defect("d2")]);
    expect(res.json().keyConflicts).toMatchObject([{ entity: "defect", entityId: "d2", key: "DEF-001", takenBy: "d1" }]);
  });

  it("goes with its project", async () => {
    const { token } = await register();
    await push(current(token), [project(), defect(), link()]);
    await push(current(token), [{ ...project(), op: "delete", revision: 2, hlc: H(300), baseRevision: 1, baseHlc: H(100) }]);
    const docs = (await pull(current(token))).docs as { entity: string; deleted: boolean }[];
    for (const e of ["defect", "defect_link"]) expect(docs.find((d) => d.entity === e)?.deleted, e).toBe(true);
  });
});

describe("migration 0010 (planner defect cards become defects)", () => {
  const insertCard = (userId: string, id: string, status: string, data: object, deleted = false, revision = 3) =>
    pool.query(
      `INSERT INTO documents (user_id, entity, entity_id, payload, revision, author, deleted, hlc)
       VALUES ($1, 'planner_card', $2, $3, $4, 'dev-a', $5, $6)`,
      [
        userId,
        id,
        {
          id,
          workspaceId: "local",
          projectId: "p1",
          ownerId: userId,
          kind: "defect",
          cardKey: `DEF-${id}`,
          title: `Bug ${id}`,
          status,
          priority: "high",
          position: 0,
          data,
          createdAt: "2026-10-01 10:00:00",
          updatedAt: "2026-10-02 10:00:00",
        },
        revision,
        deleted,
        H(revision * 10),
      ],
    );

  const convert = async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const counts = await convertPlannerDefects(client);
      await client.query("COMMIT");
      return counts;
    } finally {
      client.release();
    }
  };

  it("converts every card of every account, keeping revision and HLC, once", async () => {
    expect(await convert()).toEqual({ defects: 0, links: 0 }); // an empty store
    const a = await register("a@pharos.dev");
    const b = await register("b@pharos.dev");
    await insertCard(a.userId, "1", "backlog", { testCaseIds: ["c1", "c2"], description: "d" });
    await insertCard(a.userId, "2", "in_progress", {});
    await insertCard(a.userId, "3", "in_review", { labels: ["ui"] });
    await insertCard(a.userId, "4", "done", {}, false, 5);
    await insertCard(a.userId, "5", "backlog", {}, true);
    await insertCard(b.userId, "1", "done", { testCaseIds: ["c9"] });
    await pool.query(
      `INSERT INTO documents (user_id, entity, entity_id, payload, revision, author, deleted, hlc)
       VALUES ($1, 'planner_card', 'task', '{"id":"task","projectId":"p1","kind":"task"}', 1, 'u', false, $2)`,
      [a.userId, H(1)],
    );
    expect(await convert()).toEqual({ defects: 6, links: 3 });
    const { rows } = await pool.query(
      `SELECT user_id, entity, entity_id, payload, revision, deleted, hlc FROM documents
        WHERE entity IN ('defect', 'defect_link', 'planner_card') ORDER BY user_id, entity, entity_id`,
    );
    const of = (user: string, entity: string, id: string) =>
      rows.find((r) => r.user_id === user && r.entity === entity && r.entity_id === id);
    const d4 = of(a.userId, "defect", "4");
    expect([d4.payload.status, d4.payload.resolution, d4.revision, d4.hlc]).toEqual(["closed", "fixed", 5, H(50)]);
    expect(of(a.userId, "defect", "3").payload).toMatchObject({ status: "retest", data: { labels: ["ui"] }, defectKey: "DEF-3" });
    expect(of(a.userId, "defect", "5").deleted).toBe(true);
    expect(of(a.userId, "defect", "1").payload).toMatchObject({ description: "d", priority: "high", severity: "major" });
    const l = of(a.userId, "defect_link", linkId("1", "test_case", "c1"));
    expect([l.revision, l.hlc, l.payload.targetId]).toEqual([1, H(30), "c1"]);
    expect(of(b.userId, "defect", "1").payload.status).toBe("closed");
    // Every defect card is a tombstone now, one revision later; tasks stay.
    const card1 = of(a.userId, "planner_card", "1");
    expect([card1.deleted, card1.revision, card1.hlc]).toEqual([true, 4, H(30)]);
    expect(of(a.userId, "planner_card", "task").deleted).toBe(false);
    // Again: nothing changes.
    const seq = (await pool.query("SELECT max(seq) AS s FROM documents")).rows[0].s;
    expect(await convert()).toEqual({ defects: 0, links: 0 });
    expect((await pool.query("SELECT max(seq) AS s FROM documents")).rows[0].s).toBe(seq);
  });

  it("runs a data step in its migration's transaction: if it throws, the SQL is rolled back", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pharos-migrations-"));
    const name = `9990_runner_${Date.now()}.sql`;
    const table = `runner_probe_${Date.now()}`;
    writeFileSync(join(dir, name), `CREATE TABLE ${table} (x int);`);
    try {
      await expect(
        runMigrations(pool, {
          dir,
          dataSteps: {
            [name]: async (client) => {
              await client.query(`INSERT INTO ${table} VALUES (1)`);
              throw new Error("boom");
            },
          },
        }),
      ).rejects.toThrow(/boom/);
      expect((await pool.query("SELECT to_regclass($1) AS t", [table])).rows[0].t).toBeNull();
      expect((await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name])).rowCount).toBe(0);
      // A step that works lands with its SQL, once.
      let calls = 0;
      const steps = { [name]: async () => void calls++ };
      expect(await runMigrations(pool, { dir, dataSteps: steps })).toEqual([name]);
      expect(await runMigrations(pool, { dir, dataSteps: steps })).toEqual([]);
      expect(calls).toBe(1);
    } finally {
      await pool.query(`DROP TABLE IF EXISTS ${table}`);
      await pool.query("DELETE FROM schema_migrations WHERE name = $1", [name]);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("defects on the web", () => {
  const call = (token: string, method: string, url: string, payload?: object) =>
    app.inject({ method: method as "GET", url, headers: current(token), payload });

  it("follow the lifecycle, link and delete with their links", async () => {
    const { token } = await register();
    const p = (await call(token, "POST", "/api/projects", { name: "Checkout" })).json();
    const c = (await call(token, "POST", "/api/test-cases", { projectId: p.id, title: "Pay", author: "QA", data: {} })).json();
    const d = (
      await call(token, "POST", "/api/defects", {
        projectId: p.id,
        title: "Bug",
        severity: "critical",
        data: {},
        links: [{ targetKind: "test_case", targetId: c.id }],
      })
    ).json();
    expect(d).toMatchObject({ defectKey: "DEF-001", status: "new", severity: "critical", caseIds: [c.id] });
    expect(d.links[0]).toMatchObject({ targetKind: "test_case", label: c.scenarioId });
    const skip = await call(token, "POST", `/api/defects/${d.id}/transition`, { status: "fixed" });
    expect([skip.statusCode, skip.json().code]).toEqual([400, "defect_transition"]);
    for (const status of ["open", "in_progress", "fixed", "retest"])
      expect((await call(token, "POST", `/api/defects/${d.id}/transition`, { status })).statusCode).toBe(200);
    const noRes = await call(token, "POST", `/api/defects/${d.id}/transition`, { status: "closed" });
    expect(noRes.json().code).toBe("defect_resolution_required");
    const closed = (await call(token, "POST", `/api/defects/${d.id}/transition`, { status: "closed", resolution: "fixed" })).json();
    expect([closed.status, closed.resolution]).toEqual(["closed", "fixed"]);
    const unlinked = (
      await call(token, "POST", `/api/defects/${d.id}/links`, { target: { targetKind: "test_case", targetId: c.id }, linked: false })
    ).json();
    expect(unlinked.links).toEqual([]);
    const second = (await call(token, "POST", "/api/defects", { projectId: p.id, title: "Other", data: {} })).json();
    expect(second.defectKey).toBe("DEF-002");
    expect((await call(token, "DELETE", `/api/defects/${d.id}`)).statusCode).toBe(204);
    const list = (await call(token, "GET", `/api/defects?projectId=${p.id}`)).json();
    expect(list.map((x: { defectKey: string }) => x.defectKey)).toEqual(["DEF-002"]);
    // A deleted defect's key is never handed out again.
    expect((await call(token, "POST", "/api/defects", { projectId: p.id, title: "Third", data: {} })).json().defectKey).toBe("DEF-003");
  });
});

describe("review (DEF-01)", () => {
  const call = (token: string, method: string, url: string, payload?: object) =>
    app.inject({ method: method as "GET", url, headers: current(token), payload });

  it("never hands out a DEF key a task card kept from before DEF-01", async () => {
    const { token, userId } = await register();
    const p = (await call(token, "POST", "/api/projects", { name: "Checkout" })).json();
    await pool.query(
      `INSERT INTO documents (user_id, entity, entity_id, payload, revision, author, deleted, hlc)
       VALUES ($1, 'planner_card', 'k-task', $2, 1, 'u', false, $3)`,
      [userId, { id: "k-task", projectId: p.id, kind: "task", cardKey: "DEF-006", title: "T" }, H(1)],
    );
    const d = (await call(token, "POST", "/api/defects", { projectId: p.id, title: "Bug", data: {} })).json();
    expect(d.defectKey).toBe("DEF-007");
  });

  it("keeps KEY_SQL textually equal to the expression of documents_key_idx", async () => {
    const { KEY_SQL } = await import("../src/modules/sync/sync.repository");
    const { rows } = await pool.query<{ def: string }>(
      "SELECT pg_get_indexdef('documents_key_idx'::regclass) AS def",
    );
    const fields = (sql: string) => [...sql.matchAll(/payload ?->> ?'([A-Za-z]+)'/g)].map((m) => m[1]);
    expect(fields(rows[0].def).slice(1)).toEqual(fields(KEY_SQL));
    expect(fields(KEY_SQL)).toEqual(["scenarioId", "requirementKey", "cardKey", "runKey", "cycleKey", "defectKey"]);
  });

  it("reaches an imported result's case through its derived link on the web too", async () => {
    const { token, userId } = await register();
    const p = (await call(token, "POST", "/api/projects", { name: "Checkout" })).json();
    const c = (await call(token, "POST", "/api/test-cases", { projectId: p.id, title: "Pay", author: "QA", data: {} })).json();
    const c2 = (await call(token, "POST", "/api/test-cases", { projectId: p.id, title: "Refund", author: "QA", data: {} })).json();
    // Imported results store no link (step 9): one is linked by a later
    // mapping of its test key, the other by its tag.
    const imported = { projectId: p.id, runId: "r1", shardId: "s1", status: "failed", attempt: 0 };
    for (const [entity, id, payload] of [
      ["result", "res1", { ...imported, id: "res1", testKey: "t::pays" }],
      ["unlinked_mapping", "m1", { id: "m1", projectId: p.id, testKey: "t::pays", testCaseId: c.id }],
      ["result", "res2", { ...imported, id: "res2", testKey: "t::refunds", attributes: { tags: [`@${c2.scenarioId}`] } }],
    ] as const) {
      await pool.query(
        `INSERT INTO documents (user_id, entity, entity_id, payload, revision, author, deleted, hlc)
         VALUES ($1, $2, $3, $4, 1, 'u', false, $5)`,
        [userId, entity, id, payload, H(2)],
      );
    }
    const d = (
      await call(token, "POST", "/api/defects", {
        projectId: p.id,
        title: "Bug",
        data: {},
        links: [
          { targetKind: "result", targetId: "res1" },
          { targetKind: "result", targetId: "res2" },
        ],
      })
    ).json();
    expect(d.caseIds).toEqual([c.id, c2.id]);
  });
});
