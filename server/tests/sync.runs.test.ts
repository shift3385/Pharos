// The execution entities on the server (EJE-01, ADR-0013, design 0.2.0 §3):
// runs, run items and unlinked mappings are lww; shards and results are
// append-only; all of them only for clients with the `runs` feature, and a
// project delete takes them. Older clients get the answers they got before.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
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

async function tokenFor(email = "runs@pharos.dev"): Promise<string> {
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
/** This build, an E2 build (everything before `runs`) and 0.2.0-alpha.1. */
const current = (t: string) => withFeatures(t, "key-conflicts,append-only,complete-payload,stable-steps,runs");
const beforeRuns = (t: string) => withFeatures(t, "key-conflicts,append-only,complete-payload,stable-steps");
const alpha1 = (t: string) => withFeatures(t, "key-conflicts");

const H = (wall: number, device = "desk") => `${String(wall).padStart(15, "0")}-00000-${device}`;
const SHA = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

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
const run = (id = "r1", over: Record<string, unknown> = {}) =>
  lww("run", id, { projectId: "p1", runKey: "RUN-001", title: "Smoke", status: "in_progress", ...over });
const item = (id = "i1") => lww("run_item", id, { projectId: "p1", runId: "r1", testCaseId: "c1", testCaseRevisionId: "rev1" });
const mapping = (id = "m1") => lww("unlinked_mapping", id, { projectId: "p1", testKey: "t", testCaseId: null });
const append = (entity: string, id: string, payload: Record<string, unknown>, hlc = H(200)) => ({
  entity,
  entityId: id,
  op: "append",
  revision: 1,
  author: "u",
  hlc,
  payload: { id, ...payload },
});
const shard = (id = "s1", over: Record<string, unknown> = {}) =>
  append("run_shard", id, {
    projectId: "p1",
    runId: "r1",
    sourceFormat: "ctrf",
    sourceFileSha256: SHA,
    importedBy: "u",
    importedAt: "2026-10-31 10:00:00",
    hlc: H(200),
    ...over,
  });
const result = (id = "res1", over: Record<string, unknown> = {}) =>
  append("result", id, {
    projectId: "p1",
    runId: "r1",
    shardId: "s1",
    testKey: "tests/a.spec.ts::pays",
    status: "passed",
    attempt: 0,
    attributes: {},
    steps: [{ id: "st1", position: 0, text: "open", status: "passed" }],
    createdBy: "u",
    createdAt: "2026-10-31 10:00:00",
    hlc: H(201),
    ...over,
  });

const push = (headers: Headers, deltas: unknown[]) =>
  app.inject({ method: "POST", url: "/sync/push", headers, payload: { deltas } });
const pull = async (headers: Headers, since = 0) =>
  (await app.inject({ method: "GET", url: `/sync/pull?since=${since}`, headers })).json();
const entities = (docs: { entity: string }[]) => [...new Set(docs.map((d) => d.entity))].sort();

describe("execution entities (runs feature)", () => {
  it("is listed in the server features", () => {
    expect(SERVER_FEATURES).toContain("runs");
  });

  it("stores runs, items, mappings, shards and results and pulls them back", async () => {
    const h = current(await tokenFor());
    const res = await push(h, [project(), run(), item(), mapping()]);
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(4);
    const appended = await push(h, [shard(), result()]);
    expect(appended.json()).toMatchObject({ accepted: 2, appendRejected: [] });
    const page = await pull(h);
    expect(entities(page.docs)).toEqual(["project", "result", "run", "run_item", "run_shard", "unlinked_mapping"]);
    const res1 = page.docs.find((d: { entity: string }) => d.entity === "result");
    expect(res1.payload.steps).toHaveLength(1);
    expect(page.features).toContain("runs");
  });

  it("the same import from two devices is one copy: a no-op, not a refusal", async () => {
    const h = current(await tokenFor());
    await push(h, [project(), run()]);
    await push(h, [shard(), result()]);
    const seq = (await pool.query("SELECT max(seq) AS s FROM documents")).rows[0].s;
    // Device B: same ids and content, its own clock, time and author.
    const again = await push(h, [
      shard("s1", { importedAt: "2026-10-31 11:00:00", importedBy: "other", hlc: H(900, "b") }),
      result("res1", { createdAt: "2026-10-31 11:00:00", hlc: H(901, "b") }),
    ]);
    expect(again.json()).toMatchObject({ accepted: 2, appendRejected: [] });
    expect((await pool.query("SELECT max(seq) AS s FROM documents")).rows[0].s).toBe(seq);
    expect((await pool.query("SELECT count(*)::int AS n FROM documents WHERE entity = 'result'")).rows[0].n).toBe(1);
  });

  it("refuses other content under a result id and keeps the stored one", async () => {
    const h = current(await tokenFor());
    await push(h, [project(), run()]);
    await push(h, [result()]);
    const changed = await push(h, [result("res1", { status: "failed" })]);
    expect(changed.json().appendRejected).toEqual([{ entity: "result", entityId: "res1", reason: "content_changed" }]);
    const steps = await push(h, [
      result("res1", { steps: [{ id: "st1", position: 0, text: "open", status: "failed" }] }),
    ]);
    expect(steps.json().appendRejected).toHaveLength(1);
    const stored = await pool.query("SELECT payload FROM documents WHERE entity = 'result'");
    expect(stored.rows[0].payload.status).toBe("passed");
  });

  it("validates the documents without interpreting them", async () => {
    const h = current(await tokenFor());
    for (const bad of [
      result("x", { status: "green" }),
      result("x", { testKey: "" }),
      result("x", { attempt: -1 }),
      result("x", { steps: [{ text: "a", status: "ok" }] }),
      // An imported result carries no link: it is derived (B1).
      result("x", { shardId: "s1", testCaseId: "c1" }),
      result("x", { shardId: "s1", configurationId: "cfg1" }),
      shard("x", { normalizerVersion: -1 }),
      result("x", { shardId: "s1", steps: [{ text: "a", status: "passed", stepId: "A1" }] }),
      shard("x", { sourceFileSha256: "nope" }),
      run("x", { status: "done" }),
      lww("run_item", "x", { projectId: "p1", runId: "r1" }),
    ]) {
      const res = await push(h, [bad]);
      expect(res.statusCode, JSON.stringify(bad.payload)).toBe(400);
    }
    expect((await pool.query("SELECT count(*)::int AS n FROM documents")).rows[0].n).toBe(0);
    // A manual result (no shard) keeps its link in its content.
    const manual = result("m1", {
      shardId: null,
      runItemId: "i1",
      testCaseId: "c1",
      steps: [{ id: "st9", position: 0, stepId: "A1", text: "open", status: "passed" }],
    });
    expect((await push(h, [manual])).statusCode).toBe(200);
    await pool.query("DELETE FROM documents");
    // A tombstone carries no payload to check.
    expect((await push(h, [lww("run", "r9", {}, { op: "delete" })])).statusCode).toBe(200);
  });

  it("a project delete tombstones its runs, items, mappings, shards and results, not revisions or audit", async () => {
    const h = current(await tokenFor());
    await push(h, [project(), run(), item(), mapping()]);
    await push(h, [
      shard(),
      result(),
      append("test_case_revision", "rev1", { projectId: "p1", testCaseId: "c1", revision: 1, contentSha256: "a" }),
      append("audit_event", "e1", { projectId: "p1", action: "create", entity: "run", entityId: "r1", hash: "h" }),
    ]);
    const del = await push(h, [{ ...project(), op: "delete", revision: 2, hlc: H(300), baseRevision: 1, baseHlc: H(100) }]);
    expect(del.statusCode).toBe(200);
    const { rows } = await pool.query<{ entity: string; deleted: boolean }>(
      "SELECT entity, deleted FROM documents ORDER BY entity",
    );
    const state = Object.fromEntries(rows.map((r) => [r.entity, r.deleted]));
    expect(state).toEqual({
      audit_event: false,
      project: true,
      result: true,
      run: true,
      run_item: true,
      run_shard: true,
      test_case_revision: false,
      unlinked_mapping: true,
    });
    // A tombstoned result stays a tombstone.
    const late = await push(h, [result()]);
    expect(late.json().appendRejected).toEqual([]);
    expect((await pool.query("SELECT deleted FROM documents WHERE entity = 'result'")).rows[0].deleted).toBe(true);
    // A result or shard first pushed after the delete is stored as a
    // tombstone, as the cascade would have left it; a revision is not.
    const after = await push(h, [
      result("res-late"),
      shard("s-late"),
      append("test_case_revision", "rev-late", { projectId: "p1", testCaseId: "c1", revision: 2, contentSha256: "b" }),
    ]);
    expect(after.json().accepted).toBe(3);
    const lateRows = await pool.query<{ entity_id: string; deleted: boolean }>(
      "SELECT entity_id, deleted FROM documents WHERE entity_id IN ('res-late', 's-late', 'rev-late') ORDER BY entity_id",
    );
    expect(lateRows.rows).toEqual([
      { entity_id: "res-late", deleted: true },
      { entity_id: "rev-late", deleted: false },
      { entity_id: "s-late", deleted: true },
    ]);
    // Nobody pulls them as live documents.
    const page = await pull(h);
    expect(page.docs.filter((d: { entity: string; deleted: boolean }) => d.entity === "result" && !d.deleted)).toEqual([]);
  });
});

describe("clients without runs", () => {
  async function seeded() {
    const token = await tokenFor();
    await push(current(token), [project(), run(), item(), mapping()]);
    await push(current(token), [shard(), result()]);
    return token;
  }

  it("never see execution documents: the same answer as before this feature", async () => {
    const token = await seeded();
    for (const headers of [beforeRuns(token), alpha1(token)]) {
      const page = await pull(headers);
      expect(entities(page.docs)).toEqual(["project"]);
      expect(page.hasMore).toBe(false);
    }
    // Byte for byte what a server without the entities answers: nothing but
    // the project, with the cursor at its seq.
    const before = await pull(beforeRuns(token));
    const projectSeq = Number(
      (await pool.query("SELECT seq FROM documents WHERE entity = 'project'")).rows[0].seq,
    );
    expect(before).toEqual({
      docs: [expect.objectContaining({ entity: "project", seq: projectSeq })],
      cursor: projectSeq,
      hasMore: false,
      features: [...SERVER_FEATURES],
    });
    const old = await pull(alpha1(token));
    expect(Object.keys(old).sort()).toEqual(["cursor", "docs", "hasMore"]);
  });

  it("re-pull everything from 0 after the upgrade (cursor reset)", async () => {
    const token = await seeded();
    const old = await pull(beforeRuns(token));
    // The old build moved its cursor past the execution documents.
    const maxSeq = Number((await pool.query("SELECT max(seq) AS s FROM documents")).rows[0].s);
    expect(old.cursor).toBeLessThan(maxSeq);
    // Upgraded, its cursor restarts at 0 (APPLIED_SET_VERSION) and the pull
    // brings what it skipped.
    const upgraded = await pull(current(token), 0);
    expect(entities(upgraded.docs)).toEqual(["project", "result", "run", "run_item", "run_shard", "unlinked_mapping"]);
    expect(upgraded.cursor).toBe(maxSeq);
  });

  it("cannot push execution documents", async () => {
    const token = await tokenFor();
    const res = await push(beforeRuns(token), [project(), run()]);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("runs_unsupported");
    expect((await pool.query("SELECT count(*)::int AS n FROM documents")).rows[0].n).toBe(0);
  });

  it("keep the risk of a requirement they do not know, even sending their whole state", async () => {
    const token = await tokenFor();
    const req = (over: Record<string, unknown>, revision: number, wall: number) =>
      lww(
        "requirement",
        "req1",
        { projectId: "p1", requirementKey: "REQ-001", title: "Cards", description: "", priority: "high", ...over },
        { revision, hlc: H(wall), baseRevision: revision - 1 || null, baseHlc: revision > 1 ? H(wall - 100) : null },
      );
    await push(current(token), [project(), req({ riskLikelihood: 4, riskImpact: 5 }, 1, 100)]);
    // An E2 build edits the title: it has never heard of the risk keys.
    const edit = await push(beforeRuns(token), [req({ title: "Saved cards" }, 2, 200)]);
    expect(edit.json().accepted).toBe(1);
    const stored = (await pool.query("SELECT payload FROM documents WHERE entity = 'requirement'")).rows[0].payload;
    expect(stored).toMatchObject({ title: "Saved cards", riskLikelihood: 4, riskImpact: 5 });
    // A current client clears them by sending null.
    await push(current(token), [req({ title: "Saved cards", riskLikelihood: null, riskImpact: null }, 3, 300)]);
    const cleared = (await pool.query("SELECT payload FROM documents WHERE entity = 'requirement'")).rows[0].payload;
    expect(cleared).toMatchObject({ riskLikelihood: null, riskImpact: null });
  });

  it("0.2.0-alpha.1 stays read-only", async () => {
    const token = await tokenFor();
    const res = await push(alpha1(token), [project()]);
    expect(res.statusCode).toBe(426);
    expect(res.json().code).toBe("read_only_client_version");
  });
});

describe("run key blocks (migration 0008)", () => {
  it("leases run blocks next to the other kinds", async () => {
    const h = current(await tokenFor());
    await push(h, [project()]);
    const res = await app.inject({
      method: "POST",
      url: "/sync/key-blocks",
      headers: h,
      payload: {
        requests: [
          { projectId: "p1", kind: "run", prefix: "RUN-", floor: 1 },
          { projectId: "p1", kind: "case", prefix: "TC-", floor: 1 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().blocks).toEqual([
      { projectId: "p1", kind: "run", start: 1, end: 50 },
      { projectId: "p1", kind: "case", start: 1, end: 50 },
    ]);
    // The highest stored run key counts, like the other series.
    await push(h, [run("r2", { runKey: "RUN-120" })]);
    await pool.query("DELETE FROM key_blocks WHERE kind = 'run'");
    const next = await app.inject({
      method: "POST",
      url: "/sync/key-blocks",
      headers: h,
      payload: { requests: [{ projectId: "p1", kind: "run", prefix: "RUN-", floor: 1 }] },
    });
    expect(next.json().blocks[0].start).toBe(121);
    const constraint = await pool.query(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'key_blocks_kind_check'",
    );
    expect(constraint.rows[0].def).toContain("'cycle'");
  });

  it("a pushed run key another live run of the project holds is a key conflict", async () => {
    const h = current(await tokenFor());
    await push(h, [project(), run("r1")]);
    const res = await push(h, [run("r2")]);
    expect(res.json().keyConflicts).toEqual([{ entity: "run", entityId: "r2", key: "RUN-001", takenBy: "r1" }]);
  });
});
