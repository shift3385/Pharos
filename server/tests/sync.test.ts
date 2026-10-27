import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";

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

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe("sync", () => {
  it("rejects unauthenticated push/pull", async () => {
    expect((await app.inject({ method: "POST", url: "/sync/push", payload: { deltas: [] } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/sync/pull" })).statusCode).toBe(401);
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
});
