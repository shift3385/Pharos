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
});
