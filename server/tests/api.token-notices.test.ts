// API-token notices (INT-02 A4, ADR-0052; migration 0031): 7 days before a
// token expires its owner is told once; when a project token's owner leaves
// or is disabled, the workspace's Test Managers are told once each time.
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
  userId: string;
}

async function register(email: string): Promise<Account> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: email.split("@")[0], firstName: "F", lastName: "L" },
  });
  return { token: res.json().accessToken, userId: res.json().user.id };
}
const session = (a: Account) => ({
  authorization: `Bearer ${a.token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: SERVER_FEATURES.join(","),
});
const call = (a: Account, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as "GET", url, headers: session(a), payload: payload as object });

const H = (n: number) => `${String(n).padStart(15, "0")}-00000-dev`;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

/** Ana and Luis, Test Managers of «QA Pagos» with project p1. */
async function setup() {
  const ana = await register("ana@pharos.dev");
  const luis = await register("luis@pharos.dev");
  const ws = (await call(ana, "POST", "/workspaces", { name: "QA Pagos" })).json().id as string;
  const inv = await call(ana, "POST", `/workspaces/${ws}/invitations`, { role: "test_manager" });
  await call(luis, "POST", "/invitations/accept", { code: inv.json().code });
  await call(ana, "POST", "/sync/push", {
    workspaceId: ws,
    deltas: [
      {
        entity: "project",
        entityId: "p1",
        op: "upsert",
        revision: 1,
        author: "A",
        hlc: H(1),
        payload: { id: "p1", workspaceId: ws, name: "Pagos Web", caseIdPrefix: "PAY-" },
      },
    ],
  });
  return { ana, luis, ws };
}

async function projectToken(owner: Account, ws: string, name: string, days: number) {
  const res = await call(owner, "POST", `/workspaces/${ws}/tokens`, { name, projectId: "p1", scopes: ["runs:write"], expiresAt: inDays(days) });
  expect(res.statusCode).toBe(201);
  return res.json().view.id as string;
}

async function notices(userId: string) {
  const { rows } = await pool.query<{ kind: string; workspace_id: string | null; subject: { title: string }; data: Record<string, unknown> }>(
    `SELECT kind, workspace_id, subject, data FROM notifications WHERE recipient_id = $1 AND kind LIKE 'token.%' ORDER BY created_at, id`,
    [userId],
  );
  return rows;
}

describe("token notices", () => {
  it("tells the owner once, 7 days before expiry; a personal token's notice has no workspace", async () => {
    const { ana, ws } = await setup();
    await projectToken(ana, ws, "CI pronto", 5);
    await projectToken(ana, ws, "CI lejos", 30);
    const pat = await call(ana, "POST", "/me/tokens", { name: "Mi CLI", scopes: ["runs:read"], expiresAt: inDays(6) });
    expect(pat.statusCode).toBe(201);

    expect(await app.tokenNotices.runOnce()).toEqual({ expiring: 2, inactive: 0 });
    const got = await notices(ana.userId);
    expect(got.map((n) => [n.kind, n.subject.title, n.workspace_id])).toEqual([
      ["token.expiring", "CI pronto", ws],
      ["token.expiring", "Mi CLI", null],
    ]);
    expect(got[0].data).toMatchObject({ tokenKind: "project" });

    // Once.
    expect(await app.tokenNotices.runOnce()).toEqual({ expiring: 0, inactive: 0 });
  });

  it("tells the Test Managers when a project token's owner leaves, once each time", async () => {
    const { ana, luis, ws } = await setup();
    const id = await projectToken(luis, ws, "CI de Luis", 60);
    expect(await app.tokenNotices.runOnce()).toEqual({ expiring: 0, inactive: 0 });

    expect((await call(ana, "DELETE", `/workspaces/${ws}/members/${luis.userId}`)).statusCode).toBeLessThan(300);
    expect((await app.tokenNotices.runOnce()).inactive).toBe(1);
    const got = await notices(ana.userId);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ kind: "token.inactive", workspace_id: ws, subject: { title: "CI de Luis" } });
    expect(got[0].data).toMatchObject({ reason: "owner_left", ownerName: "F L" }); // the official name (FIX-43)
    // Luis left: he is not told.
    expect(await notices(luis.userId)).toEqual([]);
    expect((await app.tokenNotices.runOnce()).inactive).toBe(0);

    // He comes back (the token works again) and is disabled later: told again.
    await pool.query(`UPDATE workspace_members SET removed_at = NULL WHERE user_id = $1`, [luis.userId]);
    await app.tokenNotices.runOnce();
    const { rows } = await pool.query(`SELECT inactive_notified_at FROM api_tokens WHERE id = $1`, [id]);
    expect(rows[0].inactive_notified_at).toBeNull();
    await pool.query(`UPDATE users SET disabled_at = now() WHERE id = $1`, [luis.userId]);
    expect((await app.tokenNotices.runOnce()).inactive).toBe(1);
    const again = await notices(ana.userId);
    expect(again.map((n) => n.data.reason)).toEqual(["owner_left", "owner_disabled"]);
  });

  it("ignores revoked and expired tokens", async () => {
    const { ana, luis, ws } = await setup();
    const id = await projectToken(luis, ws, "Revocado", 3);
    await pool.query(`UPDATE api_tokens SET revoked_at = now(), revoke_reason = 'manual' WHERE id = $1`, [id]);
    const old = await projectToken(luis, ws, "Caducado", 3);
    await pool.query(`UPDATE api_tokens SET expires_at = now() - interval '1 day' WHERE id = $1`, [old]);
    await call(ana, "DELETE", `/workspaces/${ws}/members/${luis.userId}`);
    expect(await app.tokenNotices.runOnce()).toEqual({ expiring: 0, inactive: 0 });
  });
});
