// Read-only lists of /api/v1 (INT-02 A4, ADR-0052): cases, cycles, defects
// and requirements with a cursor over what changed, deletions included, by
// key or id, within the token's project and scope.
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

interface Account {
  token: string;
}

async function register(email: string): Promise<Account> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: email.split("@")[0], firstName: "F", lastName: "L" },
  });
  return { token: res.json().accessToken };
}
const session = (a: Account) => ({
  authorization: `Bearer ${a.token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: SERVER_FEATURES.join(","),
});
const call = (a: Account, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as "GET", url, headers: session(a), payload: payload as object });

const H = (n: number) => `${String(n).padStart(15, "0")}-00000-dev`;
const delta = (entity: string, id: string, payload: object, revision = 1, op = "upsert") => ({
  entity,
  entityId: id,
  op,
  revision,
  author: "A",
  hlc: H(revision),
  payload: { id, workspaceId: "whatever", ...payload },
});

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const ALL_READS = ["projects:read", "cases:read", "cycles:read", "defects:read", "requirements:read"];

/** Ana (Test Manager) in «QA Pagos» with projects p1 (PAY-) and p2 (WEB-),
 *  and a token of Ana for p1. */
async function setup(scopes = ALL_READS) {
  const ana = await register("ana@pharos.dev");
  const ws = (await call(ana, "POST", "/workspaces", { name: "QA Pagos" })).json().id as string;
  const push = async (deltas: object[]) => {
    const res = await call(ana, "POST", "/sync/push", { workspaceId: ws, deltas });
    expect(res.json().accepted).toBe(deltas.length);
  };
  await push([
    delta("project", "p1", { name: "Pagos Web", caseIdPrefix: "PAY-" }),
    delta("project", "p2", { name: "Web", caseIdPrefix: "WEB-" }),
    delta("test_case", "c1", { projectId: "p1", scenarioId: "PAY-001", title: "Pagar con tarjeta", status: "approved" }),
    delta("test_case", "c2", { projectId: "p1", scenarioId: "PAY-002", title: "Pagar con Bizum", status: "draft" }),
    delta("test_case", "c3", { projectId: "p1", scenarioId: "PAY-003", title: "Devolver un pago", status: "draft" }),
    delta("test_case", "w1", { projectId: "p2", scenarioId: "WEB-001", title: "Otro proyecto", status: "draft" }),
  ]);
  const tok = await call(ana, "POST", `/workspaces/${ws}/tokens`, { name: "Espejo", projectId: "p1", scopes, expiresAt: inDays(30) });
  expect(tok.statusCode).toBe(201);
  return { ana, ws, push, token: tok.json().token as string };
}

const get = (token: string, url: string) =>
  app.inject({ method: "GET", url: `/api/v1${url}`, headers: { authorization: `Bearer ${token}` } });

describe("reading cases with a cursor", () => {
  it("pages in order of change and then returns only what changed since", async () => {
    const { token, push } = await setup();
    const first = await get(token, "/projects/p1/cases?limit=2");
    expect(first.statusCode).toBe(200);
    expect(first.json().items.map((i: { key: string }) => i.key)).toEqual(["PAY-001", "PAY-002"]);
    expect(first.json().hasMore).toBe(true);
    expect(first.json().items[0]).toMatchObject({ id: "c1", deleted: false, data: { title: "Pagar con tarjeta" } });

    const second = await get(token, `/projects/p1/cases?limit=2&updatedSince=${first.json().nextCursor}`);
    expect(second.json().items.map((i: { key: string }) => i.key)).toEqual(["PAY-003"]);
    expect(second.json().hasMore).toBe(false);

    // Nothing new: an empty page that keeps the cursor.
    const idle = await get(token, `/projects/p1/cases?updatedSince=${second.json().nextCursor}`);
    expect(idle.json()).toMatchObject({ items: [], nextCursor: second.json().nextCursor, hasMore: false });

    // An edit and a deletion come after the cursor; the other project never.
    await push([
      delta("test_case", "c1", { projectId: "p1", scenarioId: "PAY-001", title: "Pagar con tarjeta (3DS)", status: "approved" }, 2),
      delta("test_case", "c2", { projectId: "p1", scenarioId: "PAY-002" }, 2, "delete"),
      delta("test_case", "w1", { projectId: "p2", scenarioId: "WEB-001", title: "Otro", status: "draft" }, 2),
    ]);
    const changed = await get(token, `/projects/p1/cases?updatedSince=${second.json().nextCursor}`);
    expect(changed.json().items).toEqual([
      expect.objectContaining({ id: "c1", deleted: false, data: expect.objectContaining({ title: "Pagar con tarjeta (3DS)" }) }),
      expect.objectContaining({ id: "c2", key: "PAY-002", deleted: true, data: null }),
    ]);
    const live = await get(token, `/projects/p1/cases?updatedSince=${second.json().nextCursor}&includeDeleted=false`);
    expect(live.json().items.map((i: { id: string }) => i.id)).toEqual(["c1"]);
  });

  it("filters by status and refuses a bad cursor", async () => {
    const { token } = await setup();
    const drafts = await get(token, "/projects/p1/cases?status=draft");
    expect(drafts.json().items.map((i: { key: string }) => i.key)).toEqual(["PAY-002", "PAY-003"]);
    expect((await get(token, "/projects/p1/cases?updatedSince=yesterday")).statusCode).toBe(400);
    expect((await get(token, "/projects/p1/cases?limit=501")).statusCode).toBe(400);
  });

  it("finds one case by key (any case) or id; another project's is not found", async () => {
    const { token } = await setup();
    expect((await get(token, "/projects/p1/cases/pay-002")).json()).toMatchObject({ id: "c2", key: "PAY-002" });
    expect((await get(token, "/projects/PAY/cases/c3")).json()).toMatchObject({ key: "PAY-003" });
    expect((await get(token, "/projects/p1/cases/WEB-001")).statusCode).toBe(404);
    // A project token never reaches another project.
    expect((await get(token, "/projects/p2/cases")).statusCode).toBe(404);
  });

  it("needs the scope", async () => {
    const { token } = await setup(["projects:read", "defects:read"]);
    const res = await get(token, "/projects/p1/cases");
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("insufficient_scope");
    expect((await get(token, "/projects/p1/defects")).statusCode).toBe(200);
  });
});

describe("cycles, defects and requirements", () => {
  it("reads a cycle with its progress, defects by status and requirements by key", async () => {
    const { token, push } = await setup();
    await push([
      delta("test_cycle", "cy1", { projectId: "p1", cycleKey: "CYC-001", title: "Sprint 12", status: "active" }),
      delta("defect", "d1", { projectId: "p1", defectKey: "DEF-001", title: "Falla el 3DS", status: "open", severity: "major", priority: "high" }),
      delta("defect", "d2", { projectId: "p1", defectKey: "DEF-002", title: "Texto cortado", status: "closed", severity: "minor", priority: "low" }),
      delta("requirement", "r1", { projectId: "p1", requirementKey: "REQ-001", title: "Pagos con 3DS", status: "active" }),
    ]);
    const cycle = await get(token, "/projects/p1/cycles/CYC-001");
    expect(cycle.statusCode).toBe(200);
    expect(cycle.json()).toMatchObject({ id: "cy1", key: "CYC-001", data: { title: "Sprint 12" }, progress: { total: 0, notRun: 0 } });
    expect((await get(token, "/projects/p1/cycles")).json().items).toHaveLength(1);

    const open = await get(token, "/projects/p1/defects?status=open");
    expect(open.json().items.map((i: { key: string }) => i.key)).toEqual(["DEF-001"]);
    expect((await get(token, "/projects/p1/requirements/REQ-001")).json()).toMatchObject({ id: "r1", data: { title: "Pagos con 3DS" } });
  });
});
