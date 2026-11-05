// `GET /api/home/metrics` (RED-W6): the thin entry point of Inicio's metrics.
// The derivation itself is step 10's (shared vectors); this checks the route:
// auth, the query it accepts and refuses, and the contract shape it returns.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { homeQuerySchema } from "../src/modules/domain/home-metrics";

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

async function token(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "home@pharos.dev", password: "supersecret1", displayName: "H", firstName: "A", lastName: "B" },
  });
  return res.json().accessToken as string;
}

const get = (url: string, t?: string) =>
  app.inject({
    method: "GET",
    url,
    headers: t ? { authorization: `Bearer ${t}`, [VERSION_HEADER]: SERVER_VERSION, [FEATURES_HEADER]: SERVER_FEATURES.join(",") } : {},
  });

const URL = "/api/home/metrics?dayStarts=100,200,300&now=350&windows=today:2,7d:0";

describe("GET /api/home/metrics (RED-W6)", () => {
  it("needs a session", async () => {
    expect((await get(URL)).statusCode).toBe(401);
  });

  it("returns the contract shape: one bucket per day start and every window", async () => {
    const res = await get(URL, await token());
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.contractVersion).toBe(1);
    expect(body.daily.map((d: { dayStart: number }) => d.dayStart)).toEqual([100, 200, 300]);
    expect(Object.keys(body.windows).sort()).toEqual(["7d", "today"]);
    expect(body.windows.today).toMatchObject({ executed: 0, passRate: null });
    expect(body.projects).toEqual([]);
  });

  it("returns the derivation's numbers for the user's projects", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "home2@pharos.dev", password: "supersecret1", displayName: "H", firstName: "A", lastName: "B" },
    });
    const t = res.json().accessToken as string;
    const userId = res.json().user.id as string;
    const call = async (method: "GET" | "POST", url: string, payload?: object) =>
      (await app.inject({ method, url, payload, headers: { authorization: `Bearer ${t}`, [VERSION_HEADER]: SERVER_VERSION, [FEATURES_HEADER]: SERVER_FEATURES.join(",") } })).json();
    const projectId = (await call("POST", "/api/projects", { name: "Checkout" })).id as string;
    const pay = await call("POST", "/api/test-cases", { projectId, title: "Pay", status: "approved", priority: "high", data: { steps: ["open"] } });
    await call("POST", "/api/test-cases", { projectId, title: "Refund", status: "approved", priority: "low", data: { steps: ["open"] } });
    const H = (wall: number) => `${String(wall).padStart(15, "0")}-00000-desk`;
    const doc = (entity: string, id: string, payload: Record<string, unknown>) =>
      pool.query(
        "INSERT INTO documents (user_id, entity, entity_id, payload, revision, author, deleted, hlc) VALUES ($1, $2, $3, $4, 1, 'u', false, $5)",
        [userId, entity, id, payload, H(Date.now())],
      );
    // A manual run (synced from the desktop) fails Pay at 10:00 UTC on day 2.
    const day = (d: number) => Date.UTC(2026, 10, d);
    await doc("run", "run1", { id: "run1", projectId, runKey: "RUN-001", title: "Manual", trigger: "manual", status: "completed", startedAt: "2026-11-02T09:00:00Z", createdAt: "2026-11-02T09:00:00Z" });
    await doc("result", "m1", { id: "m1", projectId, runId: "run1", testKey: `manual:${pay.id as string}/-/-`, testCaseId: pay.id, caseRevision: 1, status: "failed", attempt: 0, finishedAt: "2026-11-02T10:00:00Z", hlc: H(1) });

    const body = (
      await get(`/api/home/metrics?dayStarts=${day(1)},${day(2)},${day(3)}&now=${day(3) + 1000}&windows=today:2,3d:0`, t)
    ).json();
    expect(body.daily.map((d: { total: number }) => d.total)).toEqual([0, 1, 0]);
    expect(body.daily[1]).toMatchObject({ failed: 1, manual: 1, imported: 0 });
    expect(body.windows["3d"]).toMatchObject({ executed: 1, failed: 1, passRate: 0 });
    expect(body.windows.today).toMatchObject({ executed: 0, passRate: null });
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]).toMatchObject({
      projectId,
      counts: { total: 2, executed: 1, failed: 1, notRun: 1 },
      queue: { counts: { notRun: 1, blocked: 0, retest: 0 } },
    });
    expect(body.projects[0].queue.notRun[0]).toMatchObject({ title: "Refund", priority: "low" });
  });

  it("never crosses owners: the default scope is the user's own, and another user's ids give nothing", async () => {
    const account = async (email: string) => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password: "supersecret1", displayName: "H", firstName: "A", lastName: "B" },
      });
      const t = res.json().accessToken as string;
      const headers = { authorization: `Bearer ${t}`, [VERSION_HEADER]: SERVER_VERSION, [FEATURES_HEADER]: SERVER_FEATURES.join(",") };
      const project = async (name: string) =>
        (await app.inject({ method: "POST", url: "/api/projects", payload: { name }, headers })).json().id as string;
      return { t, project };
    };
    const a = await account("a@pharos.dev");
    const b = await account("b@pharos.dev");
    const a1 = await a.project("A uno");
    const a2 = await a.project("A dos");
    const b1 = await b.project("B uno");
    const q = "/api/home/metrics?dayStarts=1,2&now=3&windows=today:1";
    const ids = async (t: string, extra = "") =>
      ((await get(`${q}${extra}`, t)).json().projects as { projectId: string }[]).map((p) => p.projectId).sort();

    expect(await ids(a.t)).toEqual([a1, a2].sort());
    expect(await ids(b.t)).toEqual([b1]);
    // B asks for A's projects by id: nothing comes back.
    expect(await ids(b.t, `&projectIds=${a1},${a2}`)).toEqual([]);
    // A asks for one of its own and one of B's: only its own.
    expect(await ids(a.t, `&projectIds=${a1},${b1}`)).toEqual([a1]);
  });

  it("refuses a malformed request", async () => {
    const t = await token();
    for (const q of [
      "now=1",
      "dayStarts=&now=1",
      "dayStarts=2,1&now=3",
      "dayStarts=1,1&now=3",
      "dayStarts=10&now=5",
      "dayStarts=1,2&now=3&windows=x:2",
      "dayStarts=1,2&now=3&windows=:0",
      "dayStarts=1,a&now=3",
      "dayStarts=1&now=3&queueLimit=0",
      // Same rules as the desktop entry point.
      "dayStarts=1,2&now=3&windows=today",
      "dayStarts=1,2&now=3&windows=today:1:2",
      "dayStarts=1,2&now=3&windows=today:x",
      "dayStarts=1,2&now=3&windows=today:-1",
      "dayStarts=1&now=3&projectIds=a,,b",
      "dayStarts=1&now=3&projectIds=%20",
      `dayStarts=1&now=3&projectIds=${Array.from({ length: 201 }, (_, i) => "p" + i).join(",")}`,
    ]) {
      expect((await get(`/api/home/metrics?${q}`, t)).statusCode, q).toBe(400);
    }
  });

  it("parses project ids and the queue limit", () => {
    expect(
      homeQuerySchema.parse({ dayStarts: "1,2", now: "3", windows: "today:1", projectIds: "a, b", queueLimit: "5" }),
    ).toEqual({
      projectIds: ["a", "b"],
      dayStarts: [1, 2],
      now: 3,
      windows: [{ id: "today", fromIndex: 1 }],
      queueLimit: 5,
    });
    expect(homeQuerySchema.parse({ dayStarts: "1", now: "1" }).projectIds).toBeNull();
  });
});
