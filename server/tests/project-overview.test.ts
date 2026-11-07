// `GET /api/projects/overview` (FIX-17, ADR-0035): the one read behind the
// project lists of Proyectos and Inicio must give what the per-project
// endpoints give, and take no more queries as projects are added.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import pg, { type Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";

const URL = "/api/projects/overview";
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

async function token(email = "overview@pharos.dev"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "O", firstName: "A", lastName: "B" },
  });
  return res.json().accessToken as string;
}

const headers = (t: string) => ({
  authorization: `Bearer ${t}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: SERVER_FEATURES.join(","),
});
const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, t: string, payload?: object) =>
  app.inject({ method, url, headers: headers(t), payload });
async function post(url: string, t: string, payload: object) {
  const res = await call("POST", url, t, payload);
  expect(res.statusCode, res.body).toBeLessThan(300);
  return res.json();
}
const newProject = (t: string, name: string) => post("/api/projects", t, { name, ownerId: "ignored" });
const newRequirement = (t: string, projectId: string, requirementKey: string) =>
  post("/api/requirements", t, { projectId, requirementKey, title: requirementKey });
const newCase = (t: string, projectId: string, requirementKeys: string[], status = "draft") =>
  post("/api/test-cases", t, { projectId, title: "C", status, data: { requirementKeys } });

describe("GET /api/projects/overview", () => {
  it("needs a session", async () => {
    expect((await app.inject({ method: "GET", url: URL })).statusCode).toBe(401);
  });

  it("answers an empty list without projects", async () => {
    const res = await call("GET", URL, await token());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("gives what the per-project endpoints give, in the order of the project list", async () => {
    const t = await token();
    const b = await newProject(t, "Beta");
    const a = await newProject(t, "alfa");
    const data = {
      summary: "not needed by the lists",
      sprints: [{ name: "S", start: "2026-11-01", end: "2026-12-01" }],
      milestones: [{ name: "M", date: "2027-01-02" }],
      closureCriteria: [{ criterion: "% ejecutado", metric: "≥ 95 %" }],
    };
    await post("/api/test-plans", t, { projectId: a.id, title: "P", status: "approved", data });
    for (const key of ["R-1", "R-2"]) await newRequirement(t, a.id, key);
    await newCase(t, a.id, ["R-1"]);
    await newCase(t, a.id, []);

    const rows = (await call("GET", URL, t)).json();
    const projects = (await call("GET", "/api/projects", t)).json();
    expect(rows.map((r: { id: string }) => r.id)).toEqual(projects.map((p: { id: string }) => p.id));
    expect(rows.map((r: { id: string }) => r.id)).toEqual([a.id, b.id]);
    expect(rows[0]).toEqual({
      ...projects[0],
      plan: {
        status: "approved",
        data: { sprints: data.sprints, milestones: data.milestones, closureCriteria: data.closureCriteria },
      },
      cases: 2,
      coverage: 0.5,
    });
    expect(rows[1]).toEqual({ ...projects[1], plan: null, cases: 0, coverage: null });
  });

  it("reads a plan's status from the newest, as the plan of a project", async () => {
    const t = await token();
    const p = await newProject(t, "P");
    await post("/api/test-plans", t, { projectId: p.id, title: "Old", status: "draft", data: {} });
    await new Promise((r) => setTimeout(r, 1100)); // The stamp has seconds.
    await post("/api/test-plans", t, { projectId: p.id, title: "New", status: "reviewed", data: {} });
    const plan = (await call("GET", `/api/test-plans?projectId=${p.id}`, t)).json();
    const [row] = (await call("GET", URL, t)).json();
    expect(row.plan.status).toBe(plan.status);
    expect(row.plan.status).toBe("reviewed");
  });

  it("does not count a requirement linked only by an obsolete case as covered", async () => {
    const t = await token();
    const p = await newProject(t, "P");
    await newRequirement(t, p.id, "R-1");
    await newRequirement(t, p.id, "R-2");
    await newCase(t, p.id, ["R-1"], "obsolete");
    await newCase(t, p.id, ["R-2"]);
    const [row] = (await call("GET", URL, t)).json();
    expect(row.coverage).toBe(0.5);
    expect(row.cases).toBe(2);
  });

  it("leaves out what was deleted", async () => {
    const t = await token();
    const gone = await newProject(t, "Gone");
    const kept = await newProject(t, "Kept");
    const plan = await post("/api/test-plans", t, { projectId: kept.id, title: "P", status: "draft", data: {} });
    const requirement = await newRequirement(t, kept.id, "R-1");
    await newCase(t, kept.id, []);
    const removed = await newCase(t, kept.id, []);
    for (const url of [
      `/api/projects/${gone.id}`,
      `/api/test-plans/${plan.id}`,
      `/api/requirements/${requirement.id}`,
      `/api/test-cases/${removed.id}`,
    ]) {
      const res = await call("DELETE", url, t);
      expect(res.statusCode, res.body).toBe(204);
    }
    const rows = (await call("GET", URL, t)).json();
    expect(rows.map((r: { id: string }) => r.id)).toEqual([kept.id]);
    expect(rows[0]).toMatchObject({ plan: null, cases: 1, coverage: null });
  });

  it("shows only the user's own projects", async () => {
    const mine = await token();
    const theirs = await token("other@pharos.dev");
    const p = await newProject(theirs, "Theirs");
    await newCase(theirs, p.id, []);
    expect((await call("GET", URL, mine)).json()).toEqual([]);
  });

  it("takes the same number of queries with one project as with many", async () => {
    const t = await token();
    const first = await newProject(t, "P0");
    await newCase(t, first.id, []);
    const query = vi.spyOn(pg.Client.prototype, "query");
    const count = async () => {
      query.mockClear();
      await call("GET", URL, t);
      return query.mock.calls.length;
    };
    const one = await count();
    for (let i = 1; i <= 5; i++) {
      const p = await newProject(t, `P${i}`);
      await newCase(t, p.id, []);
    }
    expect(await count()).toBe(one);
    query.mockRestore();
  });
});
