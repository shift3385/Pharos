// Test cycles and configurations on the server (CYC-01, ADR-0017): three lww
// entities only for clients with the `cycles` feature, taken by a project
// delete; `cycleKey` is a key like the others; the web's API applies the
// desktop's rules, and progress is derived like on the desktop (shared vectors).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { cells, instantMs, type ProgressAttempt, type ProgressItem } from "../src/modules/domain/cycle-progress";

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

async function tokenFor(email = "cycles@pharos.dev"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "S", firstName: "A", lastName: "B" },
  });
  return res.json().accessToken as string;
}

type Headers = Record<string, string>;
const withFeatures = (token: string, features: string): Headers => ({
  authorization: `Bearer ${token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: features,
});
const ALL = "key-conflicts,append-only,complete-payload,stable-steps,runs,custom-fields";
/** This build and the builds before it (E3: everything up to custom fields). */
const current = (t: string) => withFeatures(t, `${ALL},cycles`);
const beforeCycles = (t: string) => withFeatures(t, ALL);

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
const project = (id = "p1") => lww("project", id, { name: "Checkout", ownerId: "x", caseIdPrefix: "TC-", caseIdDigits: 3 });
const configuration = (id = "cfg1", over: Record<string, unknown> = {}) =>
  lww("configuration", id, { projectId: "p1", name: "Chrome", attributes: {}, matchLabels: ["chromium"], ...over });
const cycle = (id = "cy1", over: Record<string, unknown> = {}) =>
  lww("test_cycle", id, {
    projectId: "p1",
    cycleKey: "CYC-001",
    title: "Regression",
    status: "planned",
    configurationIds: ["cfg1"],
    ...over,
  });
const cycleItem = (id = "it1", over: Record<string, unknown> = {}) =>
  lww("test_cycle_item", id, { projectId: "p1", cycleId: "cy1", testCaseId: "c1", ...over });

const push = (headers: Headers, deltas: unknown[]) =>
  app.inject({ method: "POST", url: "/sync/push", headers, payload: { deltas } });
const pull = async (headers: Headers, since = 0) =>
  (await app.inject({ method: "GET", url: `/sync/pull?since=${since}`, headers })).json();
const entities = (docs: { entity: string }[]) => [...new Set(docs.map((d) => d.entity))].sort();

describe("shared progress vectors (the desktop checks the same file)", () => {
  const file = JSON.parse(
    readFileSync(new URL("../../src-tauri/tests/fixtures/cycle-progress-vectors.json", import.meta.url), "utf8"),
  ) as {
    cases: {
      name: string;
      items: ProgressItem[];
      configurations: (string | null)[];
      attempts: ProgressAttempt[];
      expected: { itemId: string; configurationId: string | null; status: string; resultId: string | null }[];
    }[];
  };
  for (const c of file.cases) {
    it(c.name, () => {
      const got = cells(c.items, c.configurations, c.attempts).map((x) => ({
        itemId: x.itemId,
        configurationId: x.configurationId,
        status: x.status,
        resultId: x.resultId,
      }));
      expect(got).toEqual(c.expected);
    });
  }

  it("reads instants like the desktop", () => {
    expect(instantMs("2026-10-01T09:00:00+02:00")).toBe(Date.UTC(2026, 9, 1, 7));
    expect(instantMs("2026-10-01T09:00:00+0200")).toBe(Date.UTC(2026, 9, 1, 7));
    expect(instantMs("2026-10-02 09:00:00")).toBe(Date.UTC(2026, 9, 2, 9));
    expect(instantMs("2026-10-02T09:00:00.12345Z")).toBe(Date.UTC(2026, 9, 2, 9, 0, 0, 123));
    for (const bad of ["yesterday", "2026-10-02", "2026-13-02T09:00:00Z", "2026-10-02T09:00:00."]) expect(instantMs(bad)).toBeNull();
  });
});

describe("cycle entities (cycles feature)", () => {
  it("is listed in the server features", () => {
    expect(SERVER_FEATURES).toContain("cycles");
  });

  it("stores configurations, cycles and items and pulls them back", async () => {
    const h = current(await tokenFor());
    const res = await push(h, [project(), configuration(), cycle(), cycleItem()]);
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(4);
    expect(entities((await pull(h)).docs)).toEqual(["configuration", "project", "test_cycle", "test_cycle_item"]);
  });

  it("a client without cycles pulls exactly what it got before and may not push them", async () => {
    const t = await tokenFor();
    await push(current(t), [project()]);
    const before = await pull(beforeCycles(t));
    await push(current(t), [configuration(), cycle(), cycleItem()]);
    const after = await pull(beforeCycles(t));
    expect(after).toEqual(before);
    const refused = await push(beforeCycles(t), [cycleItem("it2")]);
    expect(refused.statusCode).toBe(400);
    expect(refused.json().code).toBe("cycles_unsupported");
  });

  it("validates the documents without interpreting them", async () => {
    const h = current(await tokenFor());
    for (const bad of [
      cycle("x", { status: "done" }),
      cycle("x", { cycleKey: "" }),
      cycle("x", { configurationIds: "cfg1" }),
      configuration("x", { name: "" }),
      configuration("x", { matchLabels: Array.from({ length: 51 }, (_, i) => `l${i}`) }),
      lww("test_cycle_item", "x", { projectId: "p1", cycleId: "cy1" }),
    ]) {
      const res = await push(h, [bad]);
      expect(res.statusCode, JSON.stringify(bad.payload)).toBe(400);
    }
    expect((await pool.query("SELECT count(*)::int AS n FROM documents")).rows[0].n).toBe(0);
    expect((await push(h, [lww("test_cycle", "x", {}, { op: "delete" })])).statusCode).toBe(200);
  });

  it("a project delete tombstones its configurations, cycles and items", async () => {
    const h = current(await tokenFor());
    await push(h, [project(), configuration(), cycle(), cycleItem()]);
    const del = await push(h, [{ ...project(), op: "delete", revision: 2, hlc: H(300), baseRevision: 1, baseHlc: H(100) }]);
    expect(del.statusCode).toBe(200);
    const { rows } = await pool.query<{ entity: string; deleted: boolean }>("SELECT entity, deleted FROM documents");
    expect(rows.every((r) => r.deleted)).toBe(true);
  });

  it("a cycle key another live cycle of the project holds is a key conflict", async () => {
    const h = current(await tokenFor());
    await push(h, [project(), configuration(), cycle()]);
    const clash = await push(h, [cycle("cy2")]);
    expect(clash.json().keyConflicts).toEqual([
      expect.objectContaining({ entity: "test_cycle", entityId: "cy2", key: "CYC-001" }),
    ]);
  });

  it("leases cycle key blocks above the keys already stored", async () => {
    const h = current(await tokenFor());
    await push(h, [project(), cycle("cy1", { cycleKey: "CYC-007" })]);
    const res = await app.inject({
      method: "POST",
      url: "/sync/key-blocks",
      headers: h,
      payload: { requests: [{ projectId: "p1", kind: "cycle", prefix: "CYC-", floor: 1 }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().blocks[0]).toMatchObject({ projectId: "p1", kind: "cycle", start: 8 });
  });

  it("migration 0009 indexes cycleKey", async () => {
    const { rows } = await pool.query("SELECT indexdef FROM pg_indexes WHERE indexname = 'documents_key_idx'");
    expect(rows[0].indexdef).toContain("cycleKey");
  });
});

describe("cycles through the web's domain API", () => {
  const api = (token: string) => {
    const headers = current(token);
    return async (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) => {
      const res = await app.inject({ method, url, headers, payload });
      return { status: res.statusCode, body: res.body ? res.json() : null };
    };
  };

  async function seed(call: ReturnType<typeof api>) {
    const projectId = (await call("POST", "/api/projects", { name: "Checkout" })).body.id as string;
    const chrome = (await call("POST", "/api/configurations", { projectId, name: "Chrome", matchLabels: ["chromium"] })).body;
    const firefox = (await call("POST", "/api/configurations", { projectId, name: "Firefox", matchLabels: ["firefox"] })).body;
    const smoke = (
      await call("POST", "/api/test-cases", { projectId, title: "Pay", status: "approved", priority: "high", data: { tags: ["smoke"], steps: ["open"] } })
    ).body;
    const draft = (await call("POST", "/api/test-cases", { projectId, title: "Refund", priority: "low", data: { steps: ["open"] } })).body;
    return { projectId, chrome, firefox, smoke, draft };
  }

  it("configurations: labels unique per project, archive frees them, reorder", async () => {
    const call = api(await tokenFor());
    const { projectId, chrome, firefox } = await seed(call);
    expect(chrome.matchLabels).toEqual(["chromium"]);
    const dup = await call("POST", "/api/configurations", { projectId, name: "Edge", matchLabels: [" Chromium"] });
    expect(dup.status).toBe(409);
    const bad = await call("POST", "/api/configurations", { projectId, name: "X", attributes: { gpu: "x" } });
    expect(bad.status).toBe(400);
    await call("POST", `/api/configurations/${chrome.id}/archive`, { archived: true });
    expect((await call("POST", "/api/configurations", { projectId, name: "Edge", matchLabels: ["chromium"] })).status).toBe(200);
    expect((await call("POST", `/api/configurations/${chrome.id}/archive`, { archived: false })).status).toBe(409);
    const ordered = (await call("POST", "/api/configurations/reorder", { projectId, ids: [firefox.id] })).body;
    expect(ordered[0].id).toBe(firefox.id);
    expect((await call("GET", `/api/configurations?projectId=${projectId}`)).body).toHaveLength(2);
    expect((await call("GET", `/api/configurations?projectId=${projectId}&includeArchived=true`)).body).toHaveLength(3);
  });

  it("two configurations with one label (two devices offline): the smallest id wins, with a warning on both", async () => {
    const t = await tokenFor();
    const h = current(t);
    await push(h, [project(), configuration("b-cfg"), configuration("a-cfg", { name: "Chrome 2" })]);
    const list = (await api(t)("GET", "/api/configurations?projectId=p1")).body as {
      id: string;
      labelClashes: { wins: boolean }[];
    }[];
    expect(list.find((c) => c.id === "a-cfg")?.labelClashes[0].wins).toBe(true);
    expect(list.find((c) => c.id === "b-cfg")?.labelClashes[0].wins).toBe(false);
  });

  it("cycles: keys, header checks, items by hand and by filter, clone and delete", async () => {
    const call = api(await tokenFor());
    const { projectId, chrome, firefox, smoke, draft } = await seed(call);
    const created = await call("POST", "/api/cycles", {
      projectId,
      title: "Regression 1.4",
      configurationIds: [chrome.id, firefox.id],
      startsOn: "2026-11-02",
      endsOn: "2026-11-13",
    });
    expect(created.status).toBe(200);
    const c = created.body;
    expect(c).toMatchObject({ cycleKey: "CYC-001", status: "planned" });
    for (const bad of [{ startsOn: "2026-02-30" }, { startsOn: "2026-11-20" }, { status: "done" }, { configurationIds: ["nope"] }]) {
      expect((await call("PUT", `/api/cycles/${c.id}`, { input: bad })).status, JSON.stringify(bad)).toBe(400);
    }
    const added = (await call("POST", `/api/cycles/${c.id}/items`, { items: [{ testCaseId: smoke.id }, { testCaseId: draft.id }, { testCaseId: smoke.id }] })).body;
    expect(added).toMatchObject({ skipped: 1, notApproved: [draft.scenarioId] });
    expect(added.added).toHaveLength(2);
    expect((await call("POST", `/api/cycles/filter-preview`, { projectId, filter: { tags: ["@smoke"] } })).body).toBe(1);
    const byFilter = (await call("POST", `/api/cycles/${c.id}/items/by-filter`, { filter: { priorities: ["low", "high"] }, assignee: "Ada" })).body;
    expect(byFilter).toMatchObject({ added: [], skipped: 2 });
    const items = (await call("GET", `/api/cycles/${c.id}/items`)).body;
    expect(items.map((i: { caseTitle: string }) => i.caseTitle)).toEqual(["Pay", "Refund"]);
    expect((await call("PUT", `/api/cycle-items/${items[1].id}`, { assignee: "Ada" })).status).toBe(204);
    const reordered = (await call("POST", `/api/cycles/${c.id}/items/reorder`, { ids: [items[1].id] })).body;
    expect(reordered[0]).toMatchObject({ id: items[1].id, assignee: "Ada" });
    const copy = (await call("POST", `/api/cycles/${c.id}/clone`, {})).body;
    expect(copy).toMatchObject({ cycleKey: "CYC-002", title: "Copia de Regression 1.4", status: "planned" });
    expect((await call("GET", `/api/cycles/${copy.id}/items`)).body).toHaveLength(2);
    expect((await call("POST", `/api/cycles/${c.id}/items/remove`, { ids: [items[0].id] })).body).toBe(1);
    // Closed: no items until it is reopened.
    await call("PUT", `/api/cycles/${c.id}`, { input: { status: "closed" } });
    expect((await call("POST", `/api/cycles/${c.id}/items`, { items: [{ testCaseId: smoke.id }] })).status).toBe(409);
    const listed = (await call("GET", `/api/cycles?projectId=${projectId}`)).body;
    expect(listed.map((x: { cycleKey: string }) => x.cycleKey).sort()).toEqual(["CYC-001", "CYC-002"]);
    expect((await call("DELETE", `/api/cycles/${c.id}`)).status).toBe(204);
    expect((await call("GET", `/api/cycles/${c.id}`)).body).toBeNull();
    const tombstones = await pool.query(
      "SELECT count(*)::int AS n FROM documents WHERE entity = 'test_cycle_item' AND deleted AND payload->>'cycleId' = $1",
      [c.id],
    );
    expect(tombstones.rows[0].n).toBe(2); // the one removed before and the one the delete took
  });

  it("progress reads the cycle's runs and results like the desktop, and a deleted cycle keeps its runs", async () => {
    const t = await tokenFor();
    const call = api(t);
    const { projectId, chrome, firefox, smoke } = await seed(call);
    const c = (await call("POST", "/api/cycles", { projectId, title: "R", configurationIds: [chrome.id, firefox.id] })).body;
    const item = (await call("POST", `/api/cycles/${c.id}/items`, { items: [{ testCaseId: smoke.id }] })).body.added[0];
    // A desktop executed it: one run per configuration, then two results.
    const run = (id: string, configurationId: string) =>
      lww("run", id, { projectId, runKey: `RUN-00${id.slice(-1)}`, title: "R", status: "in_progress", cycleId: c.id, configurationId }, { hlc: H(Date.now()) });
    const result = (id: string, runId: string, status: string, finishedAt: string) => ({
      entity: "result",
      entityId: id,
      op: "append",
      revision: 1,
      author: "u",
      hlc: H(Date.now()),
      payload: { id, projectId, runId, testKey: `manual:${smoke.id}/-/-`, testCaseId: smoke.id, status, attempt: 0, finishedAt, steps: [], hlc: H(1) },
    });
    const h = current(t);
    expect((await push(h, [run("run1", chrome.id), run("run2", firefox.id)])).statusCode).toBe(200);
    await push(h, [result("x1", "run1", "failed", "2026-10-01T10:00:00Z"), result("x2", "run2", "passed", "2026-10-01T10:00:00Z")]);
    const progress = (await call("GET", `/api/cycles/${c.id}/progress`)).body;
    expect(progress.cells).toEqual([
      { itemId: item, configurationId: chrome.id, status: "failed", resultId: "x1", runId: "run1" },
      { itemId: item, configurationId: firefox.id, status: "passed", resultId: "x2", runId: "run2" },
    ]);
    expect(progress.summary).toMatchObject({ total: 2, executed: 2, passed: 1, failed: 1, notRun: 0 });
    expect((await call("GET", `/api/cycles/${c.id}/runs`)).body).toHaveLength(2);
    await call("DELETE", `/api/cycles/${c.id}`);
    const runs = await pool.query("SELECT count(*)::int AS n FROM documents WHERE entity = 'run' AND NOT deleted");
    expect(runs.rows[0].n).toBe(2);
    // A run whose cycle is gone still pulls and pushes.
    expect((await push(h, [run("run3", chrome.id)])).statusCode).toBe(200);
  });
});

describe("cycles on the web: audit events and review fixes", () => {
  const api = (token: string) => {
    const headers = current(token);
    return async (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) => {
      const res = await app.inject({ method, url, headers, payload });
      return { status: res.statusCode, body: res.body ? res.json() : null };
    };
  };
  type Event = { action: string; entity: string; entityId: string; summary?: string | null; changes?: string | null };
  const events = async () =>
    (
      await pool.query<{ payload: Event }>(
        `SELECT payload FROM documents WHERE entity = 'audit_event' ORDER BY (payload->>'chainSeq')::bigint`,
      )
    ).rows.map((r) => r.payload);
  const since = async (n: number) => (await events()).slice(n);
  const summaryOf = (e: Event) => (e.summary ? JSON.parse(e.summary) : null);

  it("one event per create, update, clone, delete and reorder of cycles and configurations", async () => {
    const call = api(await tokenFor());
    const projectId = (await call("POST", "/api/projects", { name: "Checkout" })).body.id as string;
    const kase = (await call("POST", "/api/test-cases", { projectId, title: "Pay", data: { steps: ["open"] } })).body;

    let n = (await events()).length;
    const chrome = (await call("POST", "/api/configurations", { projectId, name: "Chrome", matchLabels: ["chromium"] })).body;
    const firefox = (await call("POST", "/api/configurations", { projectId, name: "Firefox" })).body;
    expect((await since(n)).map((e) => [e.action, e.entity])).toEqual([
      ["create", "configuration"],
      ["create", "configuration"],
    ]);

    n = (await events()).length;
    await call("PUT", `/api/configurations/${chrome.id}`, { input: { name: "Chrome 130" } });
    await call("POST", "/api/configurations/reorder", { projectId, ids: [firefox.id] });
    const conf = await since(n);
    expect(conf.map((e) => [e.action, e.entity])).toEqual([
      ["update", "configuration"],
      ["update", "project"],
    ]);
    expect(summaryOf(conf[1])).toEqual({ configurationsReordered: 2 });

    n = (await events()).length;
    const c = (await call("POST", "/api/cycles", { projectId, title: "R", configurationIds: [chrome.id] })).body;
    await call("PUT", `/api/cycles/${c.id}`, { input: { build: "1.4" } });
    await call("POST", `/api/cycles/${c.id}/items`, { items: [{ testCaseId: kase.id }] });
    const cyc = await since(n);
    expect(cyc.map((e) => [e.action, e.entity])).toEqual([
      ["create", "test_cycle"],
      ["update", "test_cycle"],
      ["update", "test_cycle"],
    ]);
    expect(summaryOf(cyc[2])).toEqual({ itemsAdded: 1 });

    n = (await events()).length;
    const copy = (await call("POST", `/api/cycles/${c.id}/clone`, {})).body;
    const cloned = await since(n);
    expect(cloned).toHaveLength(1);
    expect(cloned[0]).toMatchObject({ action: "create", entity: "test_cycle", entityId: copy.id });
    expect(summaryOf(cloned[0])).toEqual({ clonedFrom: "CYC-001", items: 1 });

    n = (await events()).length;
    expect((await call("DELETE", `/api/cycles/${c.id}`)).status).toBe(204);
    const deleted = await since(n);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatchObject({ action: "delete", entity: "test_cycle", entityId: c.id });
    expect(summaryOf(deleted[0])).toEqual({ cascade: { test_cycle_items: 1 } });
  });

  it("a label clash from two devices does not block editing either configuration", async () => {
    const t = await tokenFor();
    const h = current(t);
    await push(h, [project(), configuration("a-cfg", { name: "A" }), configuration("b-cfg", { name: "B" })]);
    const call = api(t);
    expect((await call("PUT", "/api/configurations/a-cfg", { input: { name: "A (Win)" } })).status).toBe(200);
    expect((await call("PUT", "/api/configurations/b-cfg", { input: { name: "B (Mac)", matchLabels: ["chromium"] } })).status).toBe(200);
    await push(h, [configuration("c-cfg", { name: "Edge", matchLabels: ["msedge"] })]);
    expect((await call("PUT", "/api/configurations/a-cfg", { input: { matchLabels: ["chromium", "MSEDGE"] } })).status).toBe(409);
  });

  it("an item that overlaps another of the same case is left out", async () => {
    const call = api(await tokenFor());
    const projectId = (await call("POST", "/api/projects", { name: "Checkout" })).body.id as string;
    const kase = (
      await call("POST", "/api/test-cases", {
        projectId,
        title: "Pay",
        data: { steps: ["pay <n>"], examples: { columns: ["n"], rows: [["1"], ["2"]] } },
      })
    ).body;
    const row = (kase.data.examples.rows[0] as { id: string }).id;
    const c = (await call("POST", "/api/cycles", { projectId, title: "R" })).body;
    expect((await call("POST", `/api/cycles/${c.id}/items`, { items: [{ testCaseId: kase.id, exampleRowId: row }] })).body.added).toHaveLength(1);
    const out = (await call("POST", `/api/cycles/${c.id}/items`, { items: [{ testCaseId: kase.id }] })).body;
    expect(out).toMatchObject({ added: [], skipped: 0, overlapping: [kase.scenarioId] });
  });

  it("clone leaves out archived configurations", async () => {
    const call = api(await tokenFor());
    const projectId = (await call("POST", "/api/projects", { name: "Checkout" })).body.id as string;
    const a = (await call("POST", "/api/configurations", { projectId, name: "A" })).body;
    const b = (await call("POST", "/api/configurations", { projectId, name: "B" })).body;
    const c = (await call("POST", "/api/cycles", { projectId, title: "R", configurationIds: [a.id, b.id] })).body;
    await call("POST", `/api/configurations/${b.id}/archive`, { archived: true });
    expect((await call("POST", `/api/cycles/${c.id}/clone`, {})).body.configurationIds).toEqual([a.id]);
  });
});
