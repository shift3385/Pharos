// The append_only sync class (AUD-01, design 0.2.0 §3.2, ADR-0011) and the
// rule "a key missing from an incoming document keeps the stored value"
// (VERSIONING §6.5) on the server.
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
});

async function tokenFor(email = "append@pharos.dev"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "S", firstName: "A", lastName: "B" },
  });
  return res.json().accessToken as string;
}

/** Headers of an E1 desktop, and of a 0.2.0-alpha.1 one (same version string). */
const current = (token: string) => ({
  authorization: `Bearer ${token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: "key-conflicts,append-only,complete-payload",
});
const alpha1 = (token: string) => ({
  authorization: `Bearer ${token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: "key-conflicts",
});

const H = (wall: number, device = "desk") => `${String(wall).padStart(15, "0")}-00000-${device}`;

const event = (id: string, over: Record<string, unknown> = {}) => ({
  entity: "audit_event",
  entityId: id,
  op: "append",
  revision: 1,
  author: "user:u1",
  hlc: H(100),
  payload: {
    id,
    workspaceId: "ws-1",
    projectId: "p1",
    action: "update",
    entity: "test_case",
    entityId: "c1",
    changes: { title: ["a", "b"] },
    hash: "aa",
    ...over,
  },
});

type Headers = Record<string, string>;
const push = (headers: Headers, deltas: unknown[]) =>
  app.inject({ method: "POST", url: "/sync/push", headers, payload: { deltas } });
const pull = async (headers: Headers, since = 0) =>
  (await app.inject({ method: "GET", url: `/sync/pull?since=${since}`, headers })).json();
const seqOf = async (entity: string, id: string): Promise<number> =>
  Number((await pool.query("SELECT seq FROM documents WHERE entity = $1 AND entity_id = $2", [entity, id])).rows[0].seq);

describe("append_only sync class", () => {
  it("inserts a new document and answers with the server features", async () => {
    const h = current(await tokenFor());
    const res = await push(h, [event("e1")]);
    expect(res.json()).toEqual({
      accepted: 1,
      conflicts: [],
      keyConflicts: [],
      appendRejected: [],
      features: [...SERVER_FEATURES],
    });
    const body = await pull(h);
    expect(body.features).toEqual([...SERVER_FEATURES]);
    expect(body.docs).toHaveLength(1);
    expect(body.docs[0]).toMatchObject({ entity: "audit_event", entityId: "e1", revision: 1, deleted: false });
  });

  it("takes a duplicate (a retried push) as a no-op without a new seq", async () => {
    const h = current(await tokenFor());
    await push(h, [event("e1")]);
    const seq = await seqOf("audit_event", "e1");
    // Same content, keys in another order.
    const { payload } = event("e1");
    const reordered = Object.fromEntries(Object.entries(payload).reverse());
    const res = await push(h, [{ ...event("e1"), payload: reordered }]);
    expect(res.json()).toMatchObject({ accepted: 1, conflicts: [], appendRejected: [] });
    expect(await seqOf("audit_event", "e1")).toBe(seq);
  });

  it("refuses other content under the same id and keeps the stored one", async () => {
    const h = current(await tokenFor());
    await push(h, [event("e1")]);
    const seq = await seqOf("audit_event", "e1");
    for (const tampered of [{ changes: { title: ["a", "EVIL"] } }, { hash: "bb" }, { extra: 1 }]) {
      const res = await push(h, [event("e1", tampered)]);
      expect(res.json()).toMatchObject({
        accepted: 0,
        conflicts: [],
        appendRejected: [{ entity: "audit_event", entityId: "e1", reason: "content_changed" }],
      });
    }
    const [doc] = (await pull(h)).docs;
    expect(doc.payload).toEqual(event("e1").payload);
    expect(await seqOf("audit_event", "e1")).toBe(seq);
  });

  it("is never a conflict, whatever its HLC or revision", async () => {
    const h = current(await tokenFor());
    await push(h, [event("e1", {}), { ...event("e2"), hlc: H(1) }]);
    const res = await push(h, [{ ...event("e1"), hlc: H(1), revision: 9 }]);
    expect(res.json()).toMatchObject({ accepted: 1, conflicts: [], appendRejected: [] });
  });

  it("accepts a change of location only (design §3.5), with a new seq", async () => {
    const h = current(await tokenFor());
    await push(h, [event("e1")]);
    const seq = await seqOf("audit_event", "e1");
    const res = await push(h, [event("e1", { workspaceId: "ws-2", projectId: "p9" })]);
    expect(res.json()).toMatchObject({ accepted: 1, appendRejected: [] });
    expect(await seqOf("audit_event", "e1")).toBeGreaterThan(seq);
    expect((await pull(h)).docs[0].payload).toMatchObject({ workspaceId: "ws-2", projectId: "p9" });
  });

  it("refuses upsert or delete of an append-only entity, and append of an lww one", async () => {
    const h = current(await tokenFor());
    for (const d of [
      { ...event("e1"), op: "upsert" },
      { ...event("e1"), op: "delete" },
      { entity: "test_case", entityId: "c1", op: "append", payload: {} },
    ]) {
      expect((await push(h, [d])).statusCode).toBe(400);
    }
    expect((await pull(h)).docs).toHaveLength(0);
  });

  it("deleting the project does not tombstone its audit events", async () => {
    const h = current(await tokenFor());
    await push(h, [
      { entity: "project", entityId: "p1", op: "upsert", payload: { name: "P" }, hlc: H(10) },
      { entity: "test_case", entityId: "c1", op: "upsert", payload: { projectId: "p1" }, hlc: H(11) },
      event("e1"),
    ]);
    await push(h, [{ entity: "project", entityId: "p1", op: "delete", payload: {}, hlc: H(20) }]);
    const { rows } = await pool.query("SELECT entity, deleted FROM documents ORDER BY entity");
    expect(rows).toEqual([
      { entity: "audit_event", deleted: false },
      { entity: "project", deleted: true },
      { entity: "test_case", deleted: true },
    ]);
  });
});

describe("older clients (0.1.x, 0.2.0-alpha.1)", () => {
  it("cannot push append-only documents and nothing is written", async () => {
    const token = await tokenFor();
    const res = await push(alpha1(token), [event("e1")]);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("append_only_unsupported");
    expect((await pool.query("SELECT count(*)::int AS n FROM documents")).rows[0].n).toBe(0);
  });

  it("get today's answers: no append-only documents in the pull, no new fields", async () => {
    const token = await tokenFor();
    await push(current(token), [event("e1")]);
    const lww = { entity: "project", entityId: "p1", op: "upsert", payload: { name: "P" }, hlc: H(10) };
    expect((await push(alpha1(token), [lww])).json()).toEqual({ accepted: 1, conflicts: [], keyConflicts: [] });
    const body = await pull(alpha1(token));
    expect(Object.keys(body).sort()).toEqual(["cursor", "docs", "hasMore"]);
    expect(body.docs.map((d: { entity: string }) => d.entity)).toEqual(["project"]);
    expect(body.hasMore).toBe(false);
    // The same account on an E1 desktop sees both.
    expect((await pull(current(token))).docs).toHaveLength(2);
  });

  it("an empty page of skipped documents ends the pull", async () => {
    const token = await tokenFor();
    await push(current(token), [event("e1"), event("e2")]);
    const body = await pull(alpha1(token));
    expect(body).toEqual({ docs: [], cursor: 0, hasMore: false });
  });
});

describe("an old client's upsert keeps the keys it leaves out", () => {
  const caseDelta = (payload: Record<string, unknown>, wall: number) => ({
    entity: "test_case",
    entityId: "c1",
    op: "upsert",
    payload,
    revision: wall,
    hlc: H(wall),
  });
  const stored = async () =>
    (await pool.query("SELECT payload, deleted FROM documents WHERE entity_id = 'c1'")).rows[0] as {
      payload: Record<string, unknown>;
      deleted: boolean;
    };

  it("keeps top-level keys and data keys one level deep; null clears", async () => {
    const h = alpha1(await tokenFor());
    await push(h, [
      caseDelta(
        {
          title: "Login",
          priority: "high",
          caseType: "functional",
          data: { steps: ["a"], custom: { env: "prod", team: "A" }, note: "n" },
        },
        1,
      ),
    ]);
    // An older emitter: no caseType, no data.custom; it clears `note` explicitly.
    await push(h, [caseDelta({ title: "Login v2", priority: "high", data: { steps: ["a", "b"], note: null } }, 2)]);
    expect((await stored()).payload).toEqual({
      title: "Login v2",
      priority: "high",
      caseType: "functional",
      data: { steps: ["a", "b"], custom: { env: "prod", team: "A" }, note: null },
    });
    // Present keys win whole: data.custom is replaced, not merged deeper.
    await push(h, [caseDelta({ data: { custom: { env: "dev" } } }, 3)]);
    expect((await stored()).payload.data).toEqual({ steps: ["a", "b"], custom: { env: "dev" }, note: null });
    // Explicit null at the top level clears.
    await push(h, [caseDelta({ caseType: null, data: null }, 4)]);
    expect((await stored()).payload).toMatchObject({ caseType: null, data: null });
  });

  it("never brings back a tombstone's content, nor merges into a delete", async () => {
    const h = alpha1(await tokenFor());
    await push(h, [caseDelta({ title: "Login", caseType: "functional", data: { custom: { a: 1 } } }, 1)]);
    await push(h, [{ ...caseDelta({ title: "Login" }, 2), op: "delete" }]);
    expect(await stored()).toEqual({ payload: { title: "Login" }, deleted: true });
    // A later upsert recreates it from its own payload only.
    await push(h, [caseDelta({ title: "Again", data: { steps: [] } }, 3)]);
    expect(await stored()).toEqual({ payload: { title: "Again", data: { steps: [] } }, deleted: false });
  });

  it("a push with the stored HLC stays a no-op and does not advance seq (unchanged)", async () => {
    const h = alpha1(await tokenFor());
    const d = caseDelta({ title: "Login", data: { steps: [] } }, 1);
    await push(h, [d]);
    const seq = await seqOf("test_case", "c1");
    expect((await push(h, [d])).json()).toEqual({ accepted: 1, conflicts: [], keyConflicts: [] });
    expect(await seqOf("test_case", "c1")).toBe(seq);
  });
});

describe("a current client clears a key by leaving it out (review B1)", () => {
  const stored = async (id: string) =>
    (await pool.query("SELECT payload FROM documents WHERE entity_id = $1", [id])).rows[0].payload as Record<
      string,
      unknown
    >;

  it("a desktop push with complete-payload stores its payload as sent", async () => {
    const token = await tokenFor();
    const h = current(token);
    const caseDelta = (payload: Record<string, unknown>, wall: number) => ({
      entity: "test_case",
      entityId: "c1",
      op: "upsert",
      payload,
      revision: wall,
      hlc: H(wall),
    });
    await push(h, [caseDelta({ title: "Login", caseDate: "2026-10-01", data: { steps: ["a"], flows: [1] } }, 1)]);
    // Device A cleared the date and went back to basic: both keys are gone.
    await push(h, [caseDelta({ title: "Login", data: { steps: ["a"] } }, 2)]);
    expect(await stored("c1")).toEqual({ title: "Login", data: { steps: ["a"] } });
    // Device B pulls exactly that.
    const doc = (await pull(h)).docs.find((d: { entityId: string }) => d.entityId === "c1");
    expect(doc.payload).toEqual({ title: "Login", data: { steps: ["a"] } });
    // An old client that does not know `caseType` cannot reset it.
    await push(h, [caseDelta({ title: "Login", caseType: "functional", data: { steps: ["a"] } }, 3)]);
    await push(alpha1(token), [caseDelta({ title: "Login v2", data: { steps: ["a", "b"] } }, 4)]);
    expect(await stored("c1")).toEqual({ title: "Login v2", caseType: "functional", data: { steps: ["a", "b"] } });
  });

  it("a web edit that clears the date and goes back to basic keeps them cleared after a reload", async () => {
    const token = await tokenFor("web-clear@pharos.dev");
    const headers = { ...alpha1(token) };
    const call = async (method: "GET" | "POST" | "PUT", url: string, payload?: object) => {
      const res = await app.inject({ method, url, headers, payload });
      return res.json();
    };
    const project = await call("POST", "/api/projects", { name: "P" });
    const data = {
      gherkinLevel: "advanced",
      caseDate: "2026-10-01",
      steps: ["a"],
      background: ["b"],
      examples: [{ x: 1 }],
      flows: [{ id: "f1" }],
      featureSource: "Feature: x",
    };
    const created = await call("POST", "/api/test-cases", { projectId: project.id, title: "T", author: "QA", data });
    await call("PUT", `/api/test-cases/${created.id}`, {
      input: { projectId: project.id, title: "T", author: "QA", data: { gherkinLevel: "basic", steps: ["a"] } },
      revision: created.revision,
    });
    const reloaded = await call("GET", `/api/test-cases/${created.id}`);
    expect(reloaded.data).toEqual({ gherkinLevel: "basic", steps: ["a"] });
  });
});
