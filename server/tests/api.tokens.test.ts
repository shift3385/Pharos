// API tokens and /api/v1 (INT-02, ADR-0052): who creates them, what they
// reach, every way a token stops working, the audit trail, and that the
// secret never leaks (security review points 1-5, 9, 10 of the plan).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { newToken, parseToken } from "../src/modules/api/tokenFormat";
import { createApiTokenService } from "../src/modules/api/apiTokens";
import { createServerClock } from "../src/modules/sync/sync.hlc";

let app: FastifyInstance;
let pool: Pool;
let logs = "";

beforeAll(async () => {
  ({ app, pool } = await setupTestApp({}, { logStream: { write: (line: string) => void (logs += line) } }));
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  logs = "";
});

interface Account {
  token: string;
  userId: string;
}

async function register(email: string): Promise<Account> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: email.split("@")[0], firstName: "F", lastName: "L" },
  });
  const body = res.json();
  return { token: body.accessToken, userId: body.user.id };
}

const session = (a: Account) => ({
  authorization: `Bearer ${a.token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: SERVER_FEATURES.join(","),
});
const call = (a: Account, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as "GET", url, headers: session(a), payload: payload as object });
const api = (token: string, url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: "GET", url: `/api/v1${url}`, headers: { authorization: `Bearer ${token}`, ...headers } });

const H = (n: number) => `${String(n).padStart(15, "0")}-00000-dev`;
const project = (id: string, name: string) => ({
  entity: "project",
  entityId: id,
  op: "upsert",
  revision: 1,
  author: "A",
  hlc: H(1),
  payload: { id, name, workspaceId: "whatever", caseIdPrefix: "PAY-" },
});
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
// In the canonical order the server stores them (`API_SCOPES`).
const CI_SCOPES = ["projects:read", "runs:read", "runs:write"];

/** Ana (Test Manager, and the server's administrator: the first account),
 *  Luis (Automation Engineer) and Marta (Viewer) in «QA Pagos», which holds
 *  projects p1 and p2. Ana also has p9 in her personal workspace. */
async function team() {
  const ana = await register("ana@pharos.dev");
  const luis = await register("luis@pharos.dev");
  const marta = await register("marta@pharos.dev");
  const ws = (await call(ana, "POST", "/workspaces", { name: "QA Pagos" })).json().id as string;
  for (const [who, role] of [
    [luis, "automation_engineer"],
    [marta, "viewer"],
  ] as const) {
    const inv = await call(ana, "POST", `/workspaces/${ws}/invitations`, { role });
    expect((await call(who, "POST", "/invitations/accept", { code: inv.json().code })).statusCode).toBe(200);
  }
  const pushed = await call(ana, "POST", "/sync/push", { deltas: [project("p1", "Pagos Web"), project("p2", "API Cobros")], workspaceId: ws });
  expect(pushed.json().accepted).toBe(2);
  await call(ana, "POST", "/sync/push", { deltas: [project("p9", "Mío")] });
  return { ana, luis, marta, ws };
}

async function projectToken(a: Account, ws: string, over: object = {}) {
  return call(a, "POST", `/workspaces/${ws}/tokens`, {
    name: "CI GitHub · pagos-web",
    projectId: "p1",
    scopes: CI_SCOPES,
    expiresAt: inDays(90),
    ...over,
  });
}

describe("token format", () => {
  it("has a prefix per kind and a checksum that catches a wrong character", () => {
    const t = newToken("project").raw;
    expect(t).toMatch(/^phr_prj_[0-9A-Za-z]{32}_[0-9A-Za-z]{6}$/);
    expect(parseToken(t)).toBe("project");
    expect(parseToken(newToken("personal").raw)).toBe("personal");
    const i = 12;
    const wrong = t.slice(0, i) + (t[i] === "a" ? "b" : "a") + t.slice(i + 1);
    expect(parseToken(wrong)).toBeNull();
    expect(parseToken("eyJhbGciOi.jwt.token")).toBeNull();
  });
});

describe("project tokens", () => {
  it("a Test Manager creates one; it is shown once and only its hash is stored", async () => {
    const { ana, ws } = await team();
    const res = await projectToken(ana, ws);
    expect(res.statusCode).toBe(201);
    const { token, view } = res.json();
    expect(parseToken(token)).toBe("project");
    expect(view).toMatchObject({ kind: "project", projectId: "p1", projectName: "Pagos Web", status: "active", scopes: CI_SCOPES });
    expect(token.startsWith(view.displayPrefix)).toBe(true);
    const stored = await pool.query("SELECT * FROM api_tokens");
    expect(JSON.stringify(stored.rows)).not.toContain(token);
    const list = (await call(ana, "GET", `/workspaces/${ws}/tokens`)).json().tokens;
    expect(JSON.stringify(list)).not.toContain(token);
    expect(list[0]).toHaveProperty("lastUsedIp");
  });

  it("only a Test Manager creates, rotates, reassigns or revokes; the others see the list without IPs", async () => {
    const { ana, luis, ws } = await team();
    const res = await projectToken(luis, ws);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: "forbidden", capability: "token.manage" });
    const id = (await projectToken(ana, ws)).json().view.id;
    expect((await call(luis, "DELETE", `/workspaces/${ws}/tokens/${id}`)).statusCode).toBe(403);
    expect((await call(luis, "POST", `/workspaces/${ws}/tokens/${id}/rotate`, {})).statusCode).toBe(403);
    const seen = (await call(luis, "GET", `/workspaces/${ws}/tokens`)).json().tokens;
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toHaveProperty("lastUsedIp");
  });

  it("refuses a project of another workspace, an expiry over a year and a bad scope", async () => {
    const { ana, ws } = await team();
    expect((await projectToken(ana, ws, { projectId: "p9" })).statusCode).toBe(404);
    expect((await projectToken(ana, ws, { expiresAt: inDays(400) })).json().code).toBe("invalid_expiry");
    expect((await projectToken(ana, ws, { expiresAt: inDays(-1) })).json().code).toBe("invalid_expiry");
    expect((await projectToken(ana, ws, { scopes: ["admin"] })).statusCode).toBe(400);
  });

  it("reaches its project only", async () => {
    const { ana, ws } = await team();
    const { token } = (await projectToken(ana, ws)).json();
    const me = await api(token, "/me");
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ token: { kind: "project", projectId: "p1", workspaceId: ws }, owner: { id: ana.userId } });
    const list = (await api(token, "/projects")).json().projects;
    expect(list.map((p: { id: string }) => p.id)).toEqual(["p1"]);
    expect((await api(token, "/projects/p1")).json()).toMatchObject({ id: "p1", name: "Pagos Web", workspace: { id: ws, name: "QA Pagos" } });
    expect((await api(token, "/projects/p2")).statusCode).toBe(404);
    expect((await api(token, "/projects/p9")).statusCode).toBe(404);
  });

  it("needs the scope of the route", async () => {
    const { ana, ws } = await team();
    const { token } = (await projectToken(ana, ws, { scopes: ["runs:write"] })).json();
    const res = await api(token, "/projects");
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: "insufficient_scope", scope: "projects:read" });
  });
});

describe("a token stops working", () => {
  it("when revoked, expired, or its owner left; another Test Manager reassigns it", async () => {
    const { ana, luis, ws } = await team();
    await call(ana, "PATCH", `/workspaces/${ws}/members/${luis.userId}`, { role: "test_manager" });
    const { token, view } = (await projectToken(ana, ws)).json();

    // The owner leaves: inactive, and the list says why.
    expect((await call(ana, "DELETE", `/workspaces/${ws}/members/${ana.userId}`)).statusCode).toBe(204);
    const gone = await api(token, "/me");
    expect(gone.statusCode).toBe(401);
    expect(gone.json()).toMatchObject({ code: "token_inactive", reason: "owner_left" });
    const listed = (await call(luis, "GET", `/workspaces/${ws}/tokens`)).json().tokens[0];
    expect(listed).toMatchObject({ status: "inactive", inactiveReason: "owner_left" });

    // Luis takes it over: the same secret works again, as Luis.
    const re = await call(luis, "POST", `/workspaces/${ws}/tokens/${view.id}/reassign`);
    expect(re.json()).toMatchObject({ status: "active", owner: { id: luis.userId } });
    expect((await api(token, "/me")).json().owner.id).toBe(luis.userId);

    // Expired.
    await pool.query("UPDATE api_tokens SET expires_at = now() - interval '1 second' WHERE id = $1", [view.id]);
    expect((await api(token, "/me")).json().code).toBe("token_expired");
    await pool.query("UPDATE api_tokens SET expires_at = now() + interval '1 day' WHERE id = $1", [view.id]);

    // Revoked.
    expect((await call(luis, "DELETE", `/workspaces/${ws}/tokens/${view.id}`)).statusCode).toBe(204);
    expect((await api(token, "/me")).json().code).toBe("token_revoked");
  });

  it("is suspended while its owner's account is disabled, and works again once re-enabled (SEC-12)", async () => {
    const { ana, luis, ws } = await team();
    await call(ana, "PATCH", `/workspaces/${ws}/members/${luis.userId}`, { role: "test_manager" });
    const prj = (await projectToken(luis, ws)).json();
    const pat = (await call(luis, "POST", "/me/tokens", { name: "Portátil", scopes: ["projects:read"], expiresAt: inDays(30) })).json();

    const off = await call(ana, "PUT", `/admin/users/${luis.userId}/disabled`, { disabled: true, reason: "Baja" });
    expect(off.statusCode).toBe(200);
    for (const t of [prj.token, pat.token]) {
      const res = await api(t, "/me");
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("account_disabled");
    }
    const listed = (await call(ana, "GET", `/workspaces/${ws}/tokens`)).json().tokens[0];
    expect(listed).toMatchObject({ status: "inactive", inactiveReason: "owner_disabled" });
    // Suspended, not revoked.
    expect((await pool.query("SELECT count(*) AS n FROM api_tokens WHERE revoked_at IS NOT NULL")).rows[0].n).toBe("0");

    expect((await call(ana, "PUT", `/admin/users/${luis.userId}/disabled`, { disabled: false })).statusCode).toBe(200);
    expect((await api(prj.token, "/me")).statusCode).toBe(200);
    expect((await api(pat.token, "/projects")).statusCode).toBe(200);
  });

  it("never does more than its owner's current role", async () => {
    const { ana, luis, ws } = await team();
    const { view } = (await projectToken(ana, ws)).json();
    await call(ana, "PATCH", `/workspaces/${ws}/members/${luis.userId}`, { role: "test_manager" });
    await call(luis, "POST", `/workspaces/${ws}/tokens/${view.id}/reassign`);
    await call(ana, "PATCH", `/workspaces/${ws}/members/${luis.userId}`, { role: "viewer" });
    const service = createApiTokenService(pool, createServerClock());
    const p = { ...view, tokenId: view.id, ownerId: luis.userId, displayPrefix: view.displayPrefix, expiresAt: view.expiresAt };
    await expect(service.authorize(p, "projects:read", ws)).resolves.toBeUndefined();
    await expect(service.authorize(p, "runs:write", ws)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rotating stops the old secret now, or after the overlap", async () => {
    const { ana, ws } = await team();
    const first = (await projectToken(ana, ws)).json();
    const r1 = await call(ana, "POST", `/workspaces/${ws}/tokens/${first.view.id}/rotate`, {});
    expect(r1.statusCode).toBe(201);
    expect((await api(first.token, "/me")).json().code).toBe("token_revoked");
    expect((await api(r1.json().token, "/me")).statusCode).toBe(200);

    const r2 = await call(ana, "POST", `/workspaces/${ws}/tokens/${r1.json().view.id}/rotate`, { overlapHours: 24 });
    expect((await api(r1.json().token, "/me")).statusCode).toBe(200);
    expect((await api(r2.json().token, "/me")).statusCode).toBe(200);
  });
});

describe("personal access tokens", () => {
  it("reach all of the owner's workspaces, or the one they are limited to", async () => {
    const { ana, ws } = await team();
    const all = await call(ana, "POST", "/me/tokens", { name: "Portátil", scopes: ["projects:read"], expiresAt: inDays(30) });
    expect(all.statusCode).toBe(201);
    expect(parseToken(all.json().token)).toBe("personal");
    const ids = (await api(all.json().token, "/projects")).json().projects.map((p: { id: string }) => p.id);
    expect(ids.sort()).toEqual(["p1", "p2", "p9"]);

    const one = await call(ana, "POST", "/me/tokens", { name: "Solo pagos", workspaceId: ws, scopes: ["projects:read"], expiresAt: inDays(30) });
    const limited = (await api(one.json().token, "/projects")).json().projects.map((p: { id: string }) => p.id);
    expect(limited.sort()).toEqual(["p1", "p2"]);
    expect((await api(one.json().token, "/projects/p9")).statusCode).toBe(404);

    const mine = (await call(ana, "GET", "/me/tokens")).json().tokens;
    expect(mine).toHaveLength(2);
    expect((await call(ana, "DELETE", `/me/tokens/${mine[0].id}`)).statusCode).toBe(204);
  });

  it("someone else cannot revoke them", async () => {
    const { ana, luis } = await team();
    const t = (await call(ana, "POST", "/me/tokens", { name: "x", scopes: ["projects:read"], expiresAt: inDays(30) })).json();
    expect((await call(luis, "DELETE", `/me/tokens/${t.view.id}`)).statusCode).toBe(404);
    expect((await call(luis, "DELETE", `/me/tokens/not-a-uuid`)).statusCode).toBe(404);
  });
});

describe("the server administrator", () => {
  it("lists and revokes every token of an account; nobody else may", async () => {
    const { ana, luis, ws } = await team();
    await call(ana, "PATCH", `/workspaces/${ws}/members/${luis.userId}`, { role: "test_manager" });
    const prj = (await projectToken(luis, ws)).json();
    const pat = (await call(luis, "POST", "/me/tokens", { name: "x", scopes: ["projects:read"], expiresAt: inDays(30) })).json();
    expect((await call(luis, "GET", `/admin/users/${ana.userId}/tokens`)).statusCode).toBe(403);
    expect((await call(ana, "GET", `/admin/users/${luis.userId}/tokens`)).json().tokens).toHaveLength(2);
    expect((await call(ana, "POST", `/admin/users/${luis.userId}/tokens/revoke`)).json()).toEqual({ revoked: 2 });
    expect((await api(prj.token, "/me")).json().code).toBe("token_revoked");
    expect((await api(pat.token, "/me")).json().code).toBe("token_revoked");
    const reasons = (await pool.query("SELECT revoke_reason FROM api_tokens")).rows.map((r) => r.revoke_reason);
    expect(reasons).toEqual(["admin", "admin"]);
  });
});

describe("authentication boundaries", () => {
  it("/api/v1 refuses a session, a malformed token and a token in the URL", async () => {
    const { ana, ws } = await team();
    const { token } = (await projectToken(ana, ws)).json();
    expect((await api(ana.token, "/me")).json().code).toBe("token_invalid");
    expect((await api(newToken("project").raw, "/me")).json().code).toBe("token_invalid");
    expect((await api(token.slice(0, -1) + "0", "/me")).json().code).toBe("token_invalid");
    const inUrl = await app.inject({ method: "GET", url: `/api/v1/me?token=${token}` });
    expect(inUrl.json().code).toBe("token_in_url");
    // Refused, and the request log never wrote it either.
    expect(logs).toContain("token=[redacted]");
    expect(logs).not.toContain(token);
  });

  it("session routes refuse an API token, and a token cannot manage tokens", async () => {
    const { ana, ws } = await team();
    const { token } = (await projectToken(ana, ws)).json();
    const headers = { ...session(ana), authorization: `Bearer ${token}` };
    expect((await app.inject({ method: "GET", url: "/workspaces", headers })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: `/workspaces/${ws}/tokens`, headers })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/admin/users", headers })).statusCode).toBe(401);
  });

  it("no CORS on /api/v1 except its OpenAPI document", async () => {
    const origin = { origin: "https://evil.example" };
    const me = await app.inject({ method: "OPTIONS", url: "/api/v1/me", headers: { ...origin, "access-control-request-method": "GET" } });
    expect(me.headers["access-control-allow-origin"]).toBeUndefined();
    const doc = await app.inject({ method: "GET", url: "/api/v1/openapi.json", headers: origin });
    expect(doc.statusCode).toBe(200);
    expect(doc.headers["access-control-allow-origin"]).toBeDefined();
  });
});

describe("audit and secrecy", () => {
  it("every change is an api_token event in the workspace; no event, row or log holds the secret", async () => {
    const { ana, ws } = await team();
    const { token, view } = (await projectToken(ana, ws)).json();
    await api(token, "/me");
    await call(ana, "DELETE", `/workspaces/${ws}/tokens/${view.id}`);
    const events = (
      await pool.query(
        `SELECT workspace_id, payload FROM documents WHERE entity = 'audit_event' AND payload->>'entity' = 'api_token' ORDER BY seq`,
      )
    ).rows;
    expect(events.map((e) => e.payload.action)).toEqual(["create", "delete"]);
    expect(events.every((e) => e.workspace_id === ws)).toBe(true);
    expect(events[0].payload).toMatchObject({ entityId: view.id, entityKey: view.name });
    const everything = JSON.stringify((await pool.query("SELECT payload FROM documents")).rows);
    expect(everything).not.toContain(token);
    expect(everything).not.toContain(token.slice(view.displayPrefix.length));
    expect(logs).not.toContain(token.slice(view.displayPrefix.length));
  });

  it("records when and from where a token was last used", async () => {
    const { ana, ws } = await team();
    const { token, view } = (await projectToken(ana, ws)).json();
    await api(token, "/me");
    const row = (await pool.query("SELECT last_used_at, last_used_ip FROM api_tokens WHERE id = $1", [view.id])).rows[0];
    expect(row.last_used_at).not.toBeNull();
    expect(row.last_used_ip).toBeTruthy();
  });
});
