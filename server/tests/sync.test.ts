import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { readFileSync } from "node:fs";
import { setupTestApp, truncateAll } from "./helpers";
import { SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { LOCK_USER_SQL } from "../src/modules/sync/sync.repository";

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
});

async function tokenFor(email = "sync@pharos.dev"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "S", firstName: "A", lastName: "B" },
  });
  return res.json().accessToken as string;
}

const version = { [VERSION_HEADER]: SERVER_VERSION };
const auth = (token: string) => ({ authorization: `Bearer ${token}`, ...version });

describe("sync", () => {
  it("rejects unauthenticated push/pull", async () => {
    expect((await app.inject({ method: "POST", url: "/sync/push", headers: version, payload: { deltas: [] } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/sync/pull", headers: version })).statusCode).toBe(401);
  });

  it("pushes deltas and pulls them back after the cursor", async () => {
    const token = await tokenFor();
    const push = await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: auth(token),
      payload: {
        deltas: [
          { entity: "project", entityId: "p1", op: "upsert", payload: { name: "Checkout" }, revision: 1, author: "A" },
          { entity: "test_case", entityId: "c1", op: "upsert", payload: { title: "Login" }, revision: 1, author: "A" },
        ],
      },
    });
    expect(push.statusCode).toBe(200);
    expect(push.json().accepted).toBe(2);

    const pull = await app.inject({ method: "GET", url: "/sync/pull?since=0", headers: auth(token) });
    const body = pull.json();
    expect(body.docs).toHaveLength(2);
    expect(body.cursor).toBeGreaterThan(0);
    const project = body.docs.find((d: { entity: string }) => d.entity === "project");
    expect(project.payload).toEqual({ name: "Checkout" });

    // Nothing new after the cursor.
    const empty = await app.inject({ method: "GET", url: `/sync/pull?since=${body.cursor}`, headers: auth(token) });
    expect(empty.json().docs).toHaveLength(0);
  });

  it("resolves conflicts by last-write-wins on revision", async () => {
    const token = await tokenFor();
    const put = (revision: number, name: string) =>
      app.inject({
        method: "POST",
        url: "/sync/push",
        headers: auth(token),
        payload: { deltas: [{ entity: "project", entityId: "p1", op: "upsert", payload: { name }, revision, author: "A" }] },
      });
    await put(2, "v2");
    await put(1, "v1-older"); // older revision must be ignored

    const pull = await app.inject({ method: "GET", url: "/sync/pull?since=0", headers: auth(token) });
    const doc = pull.json().docs[0];
    expect(doc.revision).toBe(2);
    expect(doc.payload).toEqual({ name: "v2" });
  });

  it("scopes documents to the authenticated user", async () => {
    const a = await tokenFor("a@pharos.dev");
    const b = await tokenFor("b@pharos.dev");
    await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: auth(a),
      payload: { deltas: [{ entity: "project", entityId: "p1", op: "upsert", payload: { name: "A only" }, revision: 1, author: "A" }] },
    });
    const pullB = await app.inject({ method: "GET", url: "/sync/pull?since=0", headers: auth(b) });
    expect(pullB.json().docs).toHaveLength(0);
  });

  describe("conflicts (Phase 8C)", () => {
    const H = (wall: number, device: string) => `${String(wall).padStart(15, "0")}-00000-${device}`;
    const push = (token: string, delta: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: "/sync/push",
        headers: auth(token),
        payload: { deltas: [{ entity: "test_case", entityId: "c1", op: "upsert", author: "A", ...delta }] },
      });

    it("rejects a delta whose base the server no longer holds and returns the server version", async () => {
      const token = await tokenFor();
      // Both devices start from revision 1 (pushed by the desktop).
      await push(token, { payload: { title: "Login" }, revision: 1, hlc: H(100, "desk") });
      // The web edits online and pushes first (no base: LWW by HLC).
      const web = await push(token, { payload: { title: "Login (web)" }, revision: 2, hlc: H(200, "web") });
      expect(web.json()).toEqual({ accepted: 1, conflicts: [] });
      // The desktop edited offline from revision 1 and pushes on reconnect.
      const desk = await push(token, {
        payload: { title: "Login (desktop)" },
        revision: 2,
        hlc: H(300, "desk"),
        baseRevision: 1,
        baseHlc: H(100, "desk"),
      });
      const body = desk.json();
      expect(body.accepted).toBe(0);
      expect(body.conflicts).toHaveLength(1);
      expect(body.conflicts[0]).toMatchObject({ entityId: "c1", revision: 2, hlc: H(200, "web"), payload: { title: "Login (web)" } });

      // Nothing was overwritten.
      const pull = await app.inject({ method: "GET", url: "/sync/pull?since=0", headers: auth(token) });
      expect(pull.json().docs[0].payload).toEqual({ title: "Login (web)" });

      // After "keep mine", the desktop re-bases on the server version and is accepted.
      const resolved = await push(token, {
        payload: { title: "Login (desktop)" },
        revision: 3,
        hlc: H(400, "desk"),
        baseRevision: 2,
        baseHlc: H(200, "web"),
      });
      expect(resolved.json()).toEqual({ accepted: 1, conflicts: [] });
    });

    it("accepts a retried push (same HLC) without reporting a conflict", async () => {
      const token = await tokenFor();
      await push(token, { payload: { title: "v1" }, revision: 1, hlc: H(100, "desk") });
      const delta = { payload: { title: "v2" }, revision: 2, hlc: H(200, "desk"), baseRevision: 1, baseHlc: H(100, "desk") };
      expect((await push(token, delta)).json().accepted).toBe(1);
      // The response was lost; the client pushes the same delta again.
      expect((await push(token, delta)).json()).toEqual({ accepted: 1, conflicts: [] });
    });

    it("pull carries the HLC of each document", async () => {
      const token = await tokenFor();
      await push(token, { payload: { title: "v1" }, revision: 1, hlc: H(100, "desk") });
      const pull = await app.inject({ method: "GET", url: "/sync/pull?since=0", headers: auth(token) });
      expect(pull.json().docs[0].hlc).toBe(H(100, "desk"));
    });
  });

  describe("client version (SYNC-08)", () => {
    const delta = { entity: "project", entityId: "p1", op: "upsert", payload: { name: "X" }, revision: 1, author: "A" };

    it("rejects a missing or unsupported version with a clear error and writes nothing", async () => {
      const token = await tokenFor();
      const bearer = { authorization: `Bearer ${token}` };
      for (const headers of [bearer, { ...bearer, [VERSION_HEADER]: "9.4.0" }, { ...bearer, [VERSION_HEADER]: "garbage" }]) {
        const res = await app.inject({ method: "POST", url: "/sync/push", headers, payload: { deltas: [delta] } });
        expect(res.statusCode).toBe(426);
        expect(res.json()).toMatchObject({ code: "unsupported_client_version", serverVersion: SERVER_VERSION });
        expect(res.json().message).toContain("Supported app versions");
        expect((await app.inject({ method: "GET", url: "/sync/pull", headers })).statusCode).toBe(426);
      }
      const pull = await app.inject({ method: "GET", url: "/sync/pull?since=0", headers: auth(token) });
      expect(pull.json().docs).toHaveLength(0);
    });

    it("accepts its own minor and the previous one, whatever the patch or pre-release", async () => {
      const token = await tokenFor();
      const [major, minor] = SERVER_VERSION.split(".").map(Number);
      const ok = [`${major}.${minor}.0`, `${major}.${minor}.7-beta.2`, ...(minor > 0 ? [`${major}.${minor - 1}.3`] : [])];
      for (const v of ok) {
        const res = await app.inject({
          method: "GET",
          url: "/sync/pull",
          headers: { authorization: `Bearer ${token}`, [VERSION_HEADER]: v },
        });
        expect(res.statusCode, v).toBe(200);
      }
    });
  });

  // Pages through the pull like the clients do; returns every doc received.
  async function pullAll(token: string) {
    const docs: { entity: string; entityId: string; deleted: boolean; payload: Record<string, unknown> }[] = [];
    let cursor = 0;
    let pages = 0;
    for (;;) {
      const body = (await app.inject({ method: "GET", url: `/sync/pull?since=${cursor}`, headers: auth(token) })).json();
      docs.push(...body.docs);
      cursor = body.cursor;
      pages++;
      if (!body.hasMore) return { docs, pages };
    }
  }

  const pushBatch = (token: string, deltas: Record<string, unknown>[]) =>
    app.inject({ method: "POST", url: "/sync/push", headers: auth(token), payload: { deltas } });

  const cases = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => ({
      entity: "test_case",
      entityId: `c${from + i}`,
      op: "upsert",
      payload: { projectId: "p1", title: `Case ${from + i}`, data: { steps: "x".repeat(200) } },
      revision: 1,
      author: "A",
      hlc: `${String(1_000 + from + i).padStart(15, "0")}-00000-desk`,
    }));

  it("pages the pull so 1,200 documents arrive complete (FIX-02)", async () => {
    const token = await tokenFor();
    for (let i = 0; i < 1200; i += 400) expect((await pushBatch(token, cases(400, i))).statusCode).toBe(200);

    const first = (await app.inject({ method: "GET", url: "/sync/pull?since=0", headers: auth(token) })).json();
    expect(first.docs).toHaveLength(500);
    expect(first.hasMore).toBe(true);

    const { docs, pages } = await pullAll(token);
    expect(pages).toBe(3);
    expect(new Set(docs.map((d) => d.entityId)).size).toBe(1200);
  });

  it("takes 2,000 changes in batches; one oversized request is refused (FIX-03)", async () => {
    const token = await tokenFor();
    expect((await pushBatch(token, cases(2000))).statusCode).toBe(400);
    let accepted = 0;
    for (let i = 0; i < 2000; i += 200) {
      const res = await pushBatch(token, cases(200, i));
      expect(res.statusCode).toBe(200);
      accepted += res.json().accepted;
    }
    expect(accepted).toBe(2000);
    // A retried batch (lost response) is accepted again without conflicts.
    expect((await pushBatch(token, cases(200, 1800))).json()).toEqual({ accepted: 200, conflicts: [] });
  });

  it("deleting a project deletes its plans, cases, requirements and cards (FIX-05, SYNC-04a)", async () => {
    const token = await tokenFor();
    const doc = (entity: string, entityId: string, projectId: string) => ({
      entity,
      entityId,
      op: "upsert",
      payload: { id: entityId, projectId },
      revision: 1,
      author: "A",
      hlc: `${String(100).padStart(15, "0")}-00000-desk`,
    });
    const created = await pushBatch(token, [
      { ...doc("project", "p1", ""), payload: { id: "p1", name: "Checkout" } },
      doc("test_plan", "tp1", "p1"),
      doc("test_case", "c1", "p1"),
      doc("requirement", "r1", "p1"),
      doc("planner_card", "d1", "p1"),
      doc("test_case", "other", "p2"),
    ]);
    expect(created.json()).toEqual({ accepted: 6, conflicts: [] });
    const { cursor } = (await app.inject({ method: "GET", url: "/sync/pull?since=0", headers: auth(token) })).json();

    const delHlc = `${String(200).padStart(15, "0")}-00000-desk`;
    const del = await pushBatch(token, [
      { entity: "project", entityId: "p1", op: "delete", payload: { id: "p1" }, revision: 2, author: "A", hlc: delHlc },
    ]);
    expect(del.json().accepted).toBe(1);

    // Another device pulls after its cursor and gets every tombstone.
    const after = (await app.inject({ method: "GET", url: `/sync/pull?since=${cursor}`, headers: auth(token) })).json();
    const deleted = after.docs.filter((d: { deleted: boolean }) => d.deleted).map((d: { entityId: string }) => d.entityId);
    expect(deleted.sort()).toEqual(["c1", "d1", "p1", "r1", "tp1"]);
    const { docs } = await pullAll(token);
    expect(docs.find((d) => d.entityId === "other")?.deleted).toBe(false);
    // The child keeps its payload, so the receiving device knows its project.
    expect(docs.find((d) => d.entityId === "c1")?.payload).toMatchObject({ projectId: "p1" });

    // A child tombstone pushed afterwards by the deleting desktop is not a conflict.
    const late = await pushBatch(token, [
      { entity: "test_case", entityId: "c1", op: "delete", payload: {}, revision: 2, author: "A", hlc: `${String(150).padStart(15, "0")}-00000-desk`, baseRevision: 1, baseHlc: doc("x", "x", "").hlc },
    ]);
    expect(late.json()).toEqual({ accepted: 1, conflicts: [] });
  });

  it("an anonymous caller gets 401, not the server version", async () => {
    const res = await app.inject({ method: "GET", url: "/sync/pull" });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain(SERVER_VERSION);
  });

  it("the cascade never touches another user's documents with the same projectId (FIX-05)", async () => {
    const a = await tokenFor("a@pharos.dev");
    const b = await tokenFor("b@pharos.dev");
    const child = { entity: "test_case", entityId: "c1", op: "upsert", payload: { projectId: "p1" }, revision: 1, author: "x", hlc: "000000000000100-00000-d" };
    await pushBatch(a, [child]);
    await pushBatch(b, [child]);
    await pushBatch(a, [{ entity: "project", entityId: "p1", op: "delete", payload: {}, revision: 2, author: "a", hlc: "000000000000200-00000-d" }]);
    expect((await pullAll(a)).docs.find((d) => d.entityId === "c1")?.deleted).toBe(true);
    expect((await pullAll(b)).docs.find((d) => d.entityId === "c1")?.deleted).toBe(false);
  });

  it("a cascaded tombstone never moves a child's HLC backwards (FIX-05)", async () => {
    const token = await tokenFor();
    const newer = "000000000000900-00000-web";
    await pushBatch(token, [{ entity: "test_case", entityId: "c1", op: "upsert", payload: { projectId: "p1" }, revision: 1, author: "x", hlc: newer }]);
    await pushBatch(token, [{ entity: "project", entityId: "p1", op: "delete", payload: {}, revision: 2, author: "a", hlc: "000000000000500-00000-desk" }]);
    const c1 = (await pullAll(token)).docs.find((d) => d.entityId === "c1") as unknown as { deleted: boolean; hlc: string };
    expect(c1).toMatchObject({ deleted: true, hlc: newer });
    // A stale web upsert (older than the child's last change) cannot revive it.
    const stale = await pushBatch(token, [{ entity: "test_case", entityId: "c1", op: "upsert", payload: { projectId: "p1" }, revision: 3, author: "w", hlc: "000000000000700-00000-web" }]);
    expect(stale.json().conflicts).toHaveLength(1);
  });

  it("serializes a user's writes so a pull cursor never skips a late commit", async () => {
    const token = await tokenFor();
    const { rows } = await pool.query<{ id: string }>("SELECT id FROM users LIMIT 1");
    const userId = rows[0].id;
    // An in-flight push of this user: it holds the user's lock and took a seq.
    const slow = await pool.connect();
    await slow.query("BEGIN");
    await slow.query(LOCK_USER_SQL, [userId]);
    await slow.query(
      `INSERT INTO documents (user_id, entity, entity_id, payload, seq) VALUES ($1, 'test_case', 'slow', '{}', nextval('documents_seq'))`,
      [userId],
    );
    // A second push starts meanwhile; it must wait instead of taking a later seq
    // and committing first.
    let done = false;
    const fast = pushBatch(token, cases(1, 0)).then((r) => {
      done = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(done).toBe(false);
    const early = (await app.inject({ method: "GET", url: "/sync/pull?since=0", headers: auth(token) })).json();
    expect(early.docs).toHaveLength(0);
    await slow.query("COMMIT");
    slow.release();
    expect((await fast).statusCode).toBe(200);
    const { docs } = await pullAll(token);
    expect(docs.map((d) => d.entityId)).toEqual(["slow", "c0"]);
  });

  it("concurrent pushes all reach a client paging the pull meanwhile", async () => {
    const token = await tokenFor();
    const seen = new Set<string>();
    let cursor = 0;
    let pushing = true;
    const pull = async () => {
      const body = (await app.inject({ method: "GET", url: `/sync/pull?since=${cursor}`, headers: auth(token) })).json();
      for (const d of body.docs) seen.add(d.entityId);
      cursor = body.cursor;
    };
    const puller = (async () => {
      while (pushing) await pull();
    })();
    await Promise.all(Array.from({ length: 20 }, (_, i) => pushBatch(token, cases(10, i * 10))));
    pushing = false;
    await puller;
    await pull();
    expect(seen.size).toBe(200);
  });

  it("migration 0004 repairs children of projects deleted before the fix (FIX-05)", async () => {
    const token = await tokenFor();
    const { rows } = await pool.query<{ id: string }>("SELECT id FROM users LIMIT 1");
    const userId = rows[0].id;
    // As the old server stored it: only the project tombstone.
    await pool.query(
      `INSERT INTO documents (user_id, entity, entity_id, payload, revision, deleted, hlc) VALUES
         ($1, 'project', 'old', '{}', 2, true, '000000000000200-00000-d'),
         ($1, 'test_case', 'oc', '{"projectId":"old"}', 1, false, '000000000000100-00000-d'),
         ($1, 'test_case', 'keep', '{"projectId":"live"}', 1, false, '000000000000100-00000-d')`,
      [userId],
    );
    const before = (await pool.query("SELECT max(seq) AS s FROM documents")).rows[0].s;
    await pool.query(readFileSync(new URL("../migrations/0004_sync_cascade.sql", import.meta.url), "utf8"));
    const { docs } = await pullAll(token);
    const byId = Object.fromEntries(docs.map((d) => [d.entityId, d]));
    expect(byId.oc.deleted).toBe(true);
    expect(byId.keep.deleted).toBe(false);
    const repaired = (await pool.query("SELECT seq, hlc, revision FROM documents WHERE entity_id = 'oc'")).rows[0];
    expect(Number(repaired.seq)).toBeGreaterThan(Number(before));
    expect(repaired).toMatchObject({ hlc: "000000000000200-00000-d", revision: 2 });
  });
});
