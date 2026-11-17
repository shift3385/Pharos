import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";

// Administración › Auditoría on the web (AUD-01): each account lists, filters
// and verifies its own `audit_event` documents, never another account's.

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

async function register(email: string): Promise<{ token: string; userId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "W", firstName: "A", lastName: "B" },
  });
  const body = res.json();
  return { token: body.accessToken as string, userId: body.user.id as string };
}

async function call(token: string, method: "GET" | "POST", url: string, payload?: unknown) {
  const res = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}`, [VERSION_HEADER]: SERVER_VERSION },
    payload: payload as object,
  });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}

/** A project and two cases: three events in the web chain. */
async function seed(token: string, name = "Checkout") {
  const p = (await call(token, "POST", "/api/projects", { name })).body as { id: string };
  for (const title of ["Pay", "Refund"]) {
    const res = await call(token, "POST", "/api/test-cases", { projectId: p.id, title, author: "QA", data: { steps: ["a"] } });
    expect(res.status).toBe(200);
  }
  return p.id;
}

describe("audit read (AUD-01)", () => {
  it("lists the account's events newest first, filtered and paged", async () => {
    const { token, userId } = await register("a@pharos.dev");
    const projectId = await seed(token);
    const all = await call(token, "GET", "/api/audit-events");
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);
    const events = all.body.events as { at: string; entity: string; projectName: string | null; actor: string }[];
    expect(events.map((e) => e.at)).toEqual([...events.map((e) => e.at)].sort().reverse());
    expect(events.every((e) => e.actor === `user:${userId}` && e.projectName === "Checkout")).toBe(true);

    const cases = await call(token, "GET", "/api/audit-events?entities=test_case&actions=create");
    expect(cases.body.total).toBe(2);
    const both = await call(token, "GET", "/api/audit-events?entities=test_case&entities=project");
    expect(both.body.total).toBe(3);
    const project = await call(token, "GET", `/api/audit-events?projectIds=${projectId}`);
    expect(project.body.total).toBe(3);
    const future = await call(token, "GET", "/api/audit-events?from=2999-01-01T00:00:00.000Z");
    expect(future.body.total).toBe(0);
    const page = await call(token, "GET", "/api/audit-events?limit=2&offset=2");
    expect([page.body.total, page.body.events.length]).toEqual([3, 1]);
    const key = (events.find((e) => e.entity === "test_case") as unknown as { entityKey: string }).entityKey;
    const search = await call(token, "GET", `/api/audit-events?search=${encodeURIComponent(key.toLowerCase())}`);
    expect(search.body.total).toBeGreaterThanOrEqual(1);
    expect((await call(token, "GET", "/api/audit-events?limit=9999")).status).toBe(400);
  });

  it("never shows another account's events", async () => {
    const a = await register("a@pharos.dev");
    const b = await register("b@pharos.dev");
    await seed(a.token);
    await seed(b.token, "Theirs");
    const list = await call(b.token, "GET", "/api/audit-events");
    expect(list.body.total).toBe(3);
    expect((list.body.events as { actor: string }[]).every((e) => e.actor === `user:${b.userId}`)).toBe(true);
    const facets = await call(b.token, "GET", "/api/audit-events/facets");
    expect(facets.body.actors).toEqual([`user:${b.userId}`]);
    expect(facets.body.entities).toEqual(["project", "test_case"]);
    expect(facets.body.projects).toEqual([expect.objectContaining({ name: "Theirs" })]);
    expect(facets.body.thisDevice).toBe("web");
  });

  it("verifies each chain and says where one breaks", async () => {
    const { token, userId } = await register("a@pharos.dev");
    await seed(token);
    const ok = await call(token, "GET", "/api/audit-events/verify");
    expect(ok.body.chains).toEqual([
      expect.objectContaining({ deviceId: "web", chainWorkspaceId: "web", chainOwner: userId, count: 3, broken: null }),
    ]);
    // Someone edits the second event in the database.
    await pool.query(
      `UPDATE documents SET payload = jsonb_set(payload, '{actor}', '"user:mallory"')
        WHERE user_id = $1 AND entity = 'audit_event' AND payload->>'chainSeq' = '2'`,
      [userId],
    );
    const { rows } = await pool.query<{ id: string; element: string }>(
      `SELECT entity_id AS id, payload->>'entityId' AS element FROM documents WHERE user_id = $1 AND entity = 'audit_event' AND payload->>'chainSeq' = '2'`,
      [userId],
    );
    const bad = await call(token, "GET", "/api/audit-events/verify");
    expect(bad.body.chains[0].broken).toEqual({ kind: "hash", seq: 2, expected: null, eventId: rows[0].id, entityId: rows[0].element });
  });

  it("asks for a session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/audit-events", headers: { [VERSION_HEADER]: SERVER_VERSION } });
    expect(res.statusCode).toBe(401);
  });
});
