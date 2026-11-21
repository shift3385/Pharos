import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import {
  FEATURES_HEADER,
  SERVER_FEATURES,
  SERVER_VERSION,
  VERSION_HEADER,
} from "../src/modules/sync/sync.version";

// Disabling an account (SEC-12, ADR-0045 amendment B, approved 2026-11-18).

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

const PASSWORD = "supersecret1";

interface Account {
  token: string;
  refresh: string;
  userId: string;
  email: string;
}

async function register(email: string): Promise<Account> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email,
      password: PASSWORD,
      displayName: email.split("@")[0],
      firstName: "F",
      lastName: "L",
    },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json();
  return {
    token: body.accessToken,
    refresh: body.refreshToken,
    userId: body.user.id,
    email,
  };
}

const headers = (a: Account) => ({
  authorization: `Bearer ${a.token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: SERVER_FEATURES.join(","),
});
const call = (a: Account, method: string, url: string, payload?: unknown) =>
  app.inject({
    method: method as "GET",
    url,
    headers: headers(a),
    payload: payload as object,
  });

async function createShared(a: Account, name: string): Promise<string> {
  const res = await call(a, "POST", "/workspaces", { name });
  expect(res.statusCode).toBe(201);
  return res.json().id;
}
async function join(
  owner: Account,
  ws: string,
  who: Account,
  role: string,
): Promise<void> {
  const inv = await call(owner, "POST", `/workspaces/${ws}/invitations`, {
    role,
  });
  expect(inv.statusCode).toBe(201);
  const ok = await call(who, "POST", "/invitations/accept", {
    code: inv.json().code,
  });
  expect(ok.statusCode).toBe(200);
}

const disable = (by: Account, target: string, body: object = {}) =>
  call(by, "PUT", `/admin/users/${target}/disabled`, {
    disabled: true,
    ...body,
  });
const enable = (by: Account, target: string) =>
  call(by, "PUT", `/admin/users/${target}/disabled`, { disabled: false });

/** Account events of `userId`'s web chain, oldest first. */
async function accountEvents(
  userId: string,
): Promise<Record<string, unknown>[]> {
  const { rows } = await pool.query<{ summary: Record<string, unknown> }>(
    `SELECT payload->'summary' AS summary FROM documents
      WHERE entity = 'audit_event' AND payload->>'entity' = 'account' AND payload->>'chainOwner' = $1
      ORDER BY seq`,
    [userId],
  );
  return rows.map((r) =>
    typeof r.summary === "string" ? JSON.parse(r.summary) : r.summary,
  );
}

describe("disabling an account (SEC-12)", () => {
  it("cuts a live token at once, revokes sessions and refuses sign-in only with the right password", async () => {
    const admin = await register("admin@pharos.dev");
    const ana = await register("ana@pharos.dev");
    expect((await call(ana, "GET", "/auth/me")).statusCode).toBe(200);

    const res = await disable(admin, ana.userId, { reason: "dejó el equipo" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ disabled: true, changed: true });

    // The access token is still valid as a JWT, but the account is read on
    // every request: web, sync and the rest answer 403 account_disabled.
    for (const [method, url] of [
      ["GET", "/auth/me"],
      ["GET", "/sync/pull?since=0"],
      ["GET", "/workspaces"],
    ] as const) {
      const r = await call(ana, method, url);
      expect(r.statusCode, url).toBe(403);
      expect(r.json().code).toBe("account_disabled");
    }
    const refresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: ana.refresh },
    });
    expect(refresh.statusCode).toBe(401);

    const wrong = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: ana.email, password: "not-the-password" },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().code).toBe("invalid_credentials");
    const right = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: ana.email, password: PASSWORD },
    });
    expect(right.statusCode).toBe(403);
    expect(right.json().code).toBe("account_disabled");

    // Nothing is deleted, and the trail is in both chains.
    const { rows } = await pool.query(
      "SELECT disabled_by, disabled_reason FROM users WHERE id = $1",
      [ana.userId],
    );
    expect(rows[0]).toEqual({
      disabled_by: admin.userId,
      disabled_reason: "dejó el equipo",
    });
    expect(await accountEvents(admin.userId)).toContainEqual(
      expect.objectContaining({
        event: "account_disabled",
        target: ana.userId,
        reason: "dejó el equipo",
      }),
    );
    expect(await accountEvents(ana.userId)).toContainEqual(
      expect.objectContaining({ event: "account_disabled", by: admin.userId }),
    );
  });

  it("re-enables: sign-in works again, sessions do not come back, and the person is told", async () => {
    const admin = await register("admin@pharos.dev");
    const ana = await register("ana@pharos.dev");
    await disable(admin, ana.userId);
    expect((await disable(admin, ana.userId)).json()).toEqual({
      disabled: true,
      changed: false,
    });

    const res = await enable(admin, ana.userId);
    expect(res.json()).toEqual({ disabled: false, changed: true });
    const refresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: ana.refresh },
    });
    expect(refresh.statusCode).toBe(401);
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: ana.email, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const { rows } = await pool.query(
      "SELECT kind FROM notifications WHERE recipient_id = $1",
      [ana.userId],
    );
    expect(rows.map((r) => r.kind)).toEqual(["account.enabled"]);
    expect(await accountEvents(ana.userId)).toContainEqual(
      expect.objectContaining({ event: "account_enabled" }),
    );
  });

  it("never oneself, never the last active administrator, and a disabled administrator administers nothing", async () => {
    const admin = await register("admin@pharos.dev");
    const bea = await register("bea@pharos.dev");
    expect((await disable(admin, admin.userId)).json().code).toBe(
      "disable_self",
    );

    expect(
      (
        await call(admin, "PUT", `/admin/users/${bea.userId}/admin`, {
          isAdmin: true,
        })
      ).statusCode,
    ).toBe(200);
    expect((await disable(admin, bea.userId)).statusCode).toBe(200);
    // Bea was an administrator; now she is disabled and counts for nothing.
    const list = await call(admin, "GET", "/admin/users?status=all");
    expect(list.json().admins).toBe(1);
    expect(list.json().disabled).toBe(1);
    // The only active administrator cannot be removed, by anyone.
    expect(
      (
        await call(admin, "PUT", `/admin/users/${admin.userId}/admin`, {
          isAdmin: false,
        })
      ).json().code,
    ).toBe("last_admin");
    // Removing the role of a disabled administrator is fine.
    expect(
      (
        await call(admin, "PUT", `/admin/users/${bea.userId}/admin`, {
          isAdmin: false,
        })
      ).statusCode,
    ).toBe(200);
    // A disabled account is enabled before being named or reset.
    expect(
      (
        await call(admin, "PUT", `/admin/users/${bea.userId}/admin`, {
          isAdmin: true,
        })
      ).json().code,
    ).toBe("account_disabled_target");
    expect(
      (
        await call(admin, "POST", `/admin/users/${bea.userId}/password-reset`, {
          delivery: "link",
        })
      ).json().code,
    ).toBe("account_disabled_target");
  });

  it("refuses to disable the last active administrator", async () => {
    const admin = await register("admin@pharos.dev");
    const bea = await register("bea@pharos.dev");
    await call(admin, "PUT", `/admin/users/${bea.userId}/admin`, {
      isAdmin: true,
    });
    bea.token = (
      await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: bea.email, password: PASSWORD },
      })
    ).json().accessToken;
    expect((await disable(bea, admin.userId)).statusCode).toBe(200);
    const impact = await call(
      bea,
      "GET",
      `/admin/users/${bea.userId}/disable-impact`,
    );
    expect(impact.json().lastAdmin).toBe(true);
  });

  it("filters the list by state and shows who disabled it", async () => {
    const admin = await register("admin@pharos.dev");
    const ana = await register("ana@pharos.dev");
    await register("bea@pharos.dev");
    await disable(admin, ana.userId, { reason: "baja" });
    const disabled = (
      await call(admin, "GET", "/admin/users?status=disabled")
    ).json();
    expect(disabled.users.map((u: { email: string }) => u.email)).toEqual([
      "ana@pharos.dev",
    ]);
    expect(disabled.users[0].disabled).toMatchObject({
      byName: "F L", // who disabled it: the official name (FIX-43)
      reason: "baja",
    });
    const active = (
      await call(admin, "GET", "/admin/users?status=active")
    ).json();
    expect(active.total).toBe(2);
    expect(
      active.users.every((u: { disabled: unknown }) => u.disabled === null),
    ).toBe(true);
  });

  it("asks for a successor where the account is the only active Test Manager, and names it", async () => {
    const admin = await register("admin@pharos.dev");
    const marcos = await register("marcos@pharos.dev");
    const ana = await register("ana@pharos.dev");
    const movil = await createShared(marcos, "QA Móvil");
    await join(marcos, movil, ana, "test_analyst");
    const solo = await createShared(marcos, "Prototipos");

    const impact = (
      await call(admin, "GET", `/admin/users/${marcos.userId}/disable-impact`)
    ).json();
    expect(impact.lastAdmin).toBe(false);
    expect(impact.managedAlone).toEqual([
      expect.objectContaining({
        workspaceId: solo,
        name: "Prototipos",
        candidates: [],
      }),
      expect.objectContaining({
        workspaceId: movil,
        name: "QA Móvil",
        candidates: [
          // Named by the official name, not the alias (FIX-51).
          expect.objectContaining({ userId: ana.userId, displayName: "F L", role: "test_analyst" }),
        ],
      }),
    ]);

    const missing = await disable(admin, marcos.userId);
    expect(missing.statusCode).toBe(409);
    expect(missing.json()).toMatchObject({
      code: "successor_required",
      workspaces: [movil],
    });
    expect(
      (
        await disable(admin, marcos.userId, {
          successors: [{ workspaceId: movil, userId: admin.userId }],
        })
      ).json().code,
    ).toBe("invalid_successor");

    const ok = await disable(admin, marcos.userId, {
      successors: [{ workspaceId: movil, userId: ana.userId }],
    });
    expect(ok.statusCode).toBe(200);
    const ws = (await call(ana, "GET", "/workspaces")).json().workspaces;
    const members = ws.find((w: { id: string }) => w.id === movil).members;
    expect(members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: ana.userId,
          role: "test_manager",
          disabled: false,
        }),
        expect.objectContaining({
          userId: marcos.userId,
          role: "test_manager",
          disabled: true,
        }),
      ]),
    );
    // The succession is audited in that workspace, and Ana (now its Test
    // Manager) is told that Marcos lost access.
    const { rows: events } = await pool.query(
      `SELECT payload->'summary' AS summary FROM documents
        WHERE workspace_id = $1 AND entity = 'audit_event' AND payload->>'entity' = 'workspace'`,
      [movil],
    );
    expect(
      events.map((e) =>
        typeof e.summary === "string" ? JSON.parse(e.summary) : e.summary,
      ),
    ).toContainEqual(
      expect.objectContaining({
        event: "test_manager_succession",
        from: marcos.userId,
        to: ana.userId,
      }),
    );
    const { rows: notes } = await pool.query(
      "SELECT kind, workspace_id FROM notifications WHERE recipient_id = $1",
      [ana.userId],
    );
    expect(notes).toContainEqual({
      kind: "member.disabled",
      workspace_id: movil,
    });
  });

  it("a disabled member is not active: not notified and not counted as Test Manager", async () => {
    const admin = await register("admin@pharos.dev");
    const marcos = await register("marcos@pharos.dev");
    const ana = await register("ana@pharos.dev");
    const ws = await createShared(marcos, "QA");
    await join(marcos, ws, ana, "test_manager");
    await disable(admin, marcos.userId);
    // Ana is now the only active Test Manager: she cannot step down.
    const step = await call(
      ana,
      "PATCH",
      `/workspaces/${ws}/members/${ana.userId}`,
      { role: "viewer" },
    );
    expect(step.statusCode).toBe(409);
    expect(step.json().code).toBe("last_test_manager");
  });

  it("recovery treats a disabled account as unknown and an open reset link stops working", async () => {
    const admin = await register("admin@pharos.dev");
    const ana = await register("ana@pharos.dev");
    const link = await call(
      admin,
      "POST",
      `/admin/users/${ana.userId}/password-reset`,
      { delivery: "link" },
    );
    const token = link.json().token as string;
    await disable(admin, ana.userId);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/reset/check",
          payload: { token },
        })
      ).statusCode,
    ).toBe(400);
    const confirm = await app.inject({
      method: "POST",
      url: "/auth/reset/confirm",
      payload: { token, newPassword: "a-much-longer-passphrase" },
    });
    expect(confirm.statusCode).toBe(400);
    const recover = await app.inject({
      method: "POST",
      url: "/auth/recover",
      payload: {
        email: ana.email,
        code: "ABCDE-FGHJK",
        newPassword: "a-much-longer-passphrase",
      },
    });
    expect(recover.json().code).toBe("invalid_recovery");
  });

  it("only an administrator disables", async () => {
    await register("admin@pharos.dev");
    const ana = await register("ana@pharos.dev");
    const bea = await register("bea@pharos.dev");
    const res = await disable(ana, bea.userId);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("admin_required");
  });
});
