import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { buildApp } from "../src/app";
import { createMemoryMailer } from "../src/modules/auth/mailer";
import { readFileSync } from "node:fs";
import { setupTestApp, testEnv, truncateAll } from "./helpers";

// The server administrator (SEC-11) and password reset by an administrator
// (SEC-09); ADR-0045 amendment, approved 2026-11-18.

let app: FastifyInstance; // no SMTP
let mailApp: FastifyInstance; // SMTP (memory mailer) and PHAROS_ADMINS
let pool: Pool;
const mailer = createMemoryMailer();

beforeAll(async () => {
  ({ app, pool } = await setupTestApp());
  mailApp = buildApp({
    pool,
    env: {
      ...testEnv,
      APP_PUBLIC_URL: "https://qa.example.com",
      PHAROS_ADMINS: ["boss@pharos.dev"],
    },
    mailer,
  });
  await mailApp.ready();
});
afterAll(async () => {
  await app.close();
  await mailApp.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  mailer.outbox.length = 0;
});

const PASSWORD = "supersecret1";
const NEW_PASSWORD = "a-much-longer-passphrase";

interface Account {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; isAdmin: boolean };
}

async function register(
  email: string,
  name = email.split("@")[0],
  on = app,
): Promise<Account> {
  const res = await on.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email,
      password: PASSWORD,
      displayName: name,
      firstName: name,
      lastName: "Test",
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}
const auth = (a: Account) => ({ authorization: `Bearer ${a.accessToken}` });
const resetFor = (
  by: Account,
  target: string,
  delivery: "email" | "link" = "link",
  on = app,
) =>
  on.inject({
    method: "POST",
    url: `/admin/users/${target}/password-reset`,
    headers: auth(by),
    payload: { delivery },
  });
const setAdmin = (by: Account, target: string, isAdmin: boolean) =>
  app.inject({
    method: "PUT",
    url: `/admin/users/${target}/admin`,
    headers: auth(by),
    payload: { isAdmin },
  });

/** Account events in a user's personal workspace chain. */
async function accountEvents(userId: string) {
  const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
    `SELECT d.payload FROM documents d
       JOIN workspaces w ON w.id = d.workspace_id AND w.kind = 'personal' AND w.created_by = $1
      WHERE d.entity = 'audit_event' AND d.payload->>'entity' = 'account'
      ORDER BY (d.payload->>'chainSeq')::bigint`,
    [userId],
  );
  return rows.map(
    (r) => JSON.parse(String(r.payload.summary)) as Record<string, unknown>,
  );
}
const notificationsOf = async (userId: string) =>
  (
    await pool.query<{ kind: string }>(
      "SELECT kind FROM notifications WHERE recipient_id = $1 ORDER BY seq",
      [userId],
    )
  ).rows.map((r) => r.kind);

describe("who is a server administrator", () => {
  it("the first account of the server, and nobody after it", async () => {
    const first = await register("first@pharos.dev");
    const second = await register("second@pharos.dev");
    expect(first.user.isAdmin).toBe(true);
    expect(second.user.isAdmin).toBe(false);
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: auth(first),
    });
    expect(me.json().isAdmin).toBe(true);
  });

  it("two sign-ups at once on an empty server make one administrator", async () => {
    const all = await Promise.all(
      ["a", "b", "c", "d"].map((n) => register(`${n}@pharos.dev`)),
    );
    expect(all.filter((a) => a.user.isAdmin)).toHaveLength(1);
  });

  it("PHAROS_ADMINS names at sign-up and at start-up, and never removes", async () => {
    await register("first@pharos.dev", "first", mailApp);
    const boss = await register("BOSS@pharos.dev", "boss", mailApp);
    expect(boss.user.isAdmin).toBe(true);

    await pool.query(
      "UPDATE users SET is_admin = false WHERE email = 'boss@pharos.dev'",
    );
    const again = buildApp({
      pool,
      env: { ...testEnv, PHAROS_ADMINS: ["boss@pharos.dev"] },
    });
    await again.ready();
    await again.close();
    const { rows } = await pool.query(
      "SELECT email FROM users WHERE is_admin ORDER BY email",
    );
    expect(rows.map((r) => r.email)).toEqual([
      "boss@pharos.dev",
      "first@pharos.dev",
    ]);
  });

  it("an administrator names and removes others; the last one stays", async () => {
    const first = await register("first@pharos.dev");
    const ana = await register("ana@pharos.dev");
    expect((await setAdmin(first, first.user.id, false)).json().code).toBe(
      "last_admin",
    );

    const grant = await setAdmin(first, ana.user.id, true);
    expect(grant.json()).toEqual({ isAdmin: true, changed: true });
    // Read from the database: Ana's old token is enough.
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/admin/users",
          headers: auth(ana),
        })
      ).statusCode,
    ).toBe(200);

    expect((await setAdmin(ana, first.user.id, false)).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/admin/users",
          headers: auth(first),
        })
      ).json().code,
    ).toBe("admin_required");
    expect((await setAdmin(ana, ana.user.id, false)).json().code).toBe(
      "last_admin",
    );

    expect(await notificationsOf(ana.user.id)).toEqual([
      "account.admin_granted",
    ]);
    expect(await notificationsOf(first.user.id)).toEqual([
      "account.admin_revoked",
    ]);
    expect(await accountEvents(ana.user.id)).toEqual([
      { event: "admin_granted", by: first.user.id },
      { event: "admin_revoked", target: first.user.id },
    ]);
  });

  it("migration 0026 names the oldest account on a server that has none", async () => {
    await register("old@pharos.dev");
    await register("new@pharos.dev");
    await pool.query("UPDATE users SET is_admin = false");
    await pool.query(
      "UPDATE users SET created_at = now() - interval '1 year' WHERE email = 'old@pharos.dev'",
    );
    const sql = readFileSync(
      new URL("../migrations/0026_server_admins.sql", import.meta.url),
      "utf8",
    );
    await pool.query(sql);
    await pool.query(sql); // idempotent: still one
    const { rows } = await pool.query("SELECT email FROM users WHERE is_admin");
    expect(rows.map((r) => r.email)).toEqual(["old@pharos.dev"]);
  });

  it("refuses the administration routes to anyone else", async () => {
    await register("first@pharos.dev");
    const ana = await register("ana@pharos.dev");
    const res = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers: auth(ana),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("admin_required");
    expect((await resetFor(ana, ana.user.id)).statusCode).toBe(403);
    expect(
      (await app.inject({ method: "GET", url: "/admin/users" })).statusCode,
    ).toBe(401);
  });

  it("lists every account, with search", async () => {
    const first = await register("first@pharos.dev", "Luis");
    await register("ana@pharos.dev", "Ana");
    await register("marta@pharos.dev", "Marta");
    const all = (
      await app.inject({
        method: "GET",
        url: "/admin/users",
        headers: auth(first),
      })
    ).json();
    expect(all.total).toBe(3);
    expect(all.admins).toBe(1);
    expect(all.users[0]).toMatchObject({
      email: "first@pharos.dev",
      isAdmin: true,
      recoveryCodes: { total: 10, remaining: 10 },
    });
    expect(JSON.stringify(all)).not.toMatch(/password|hash/i);
    const some = (
      await app.inject({
        method: "GET",
        url: "/admin/users?q=ANA",
        headers: auth(first),
      })
    ).json();
    expect(some.users.map((u: { email: string }) => u.email)).toEqual([
      "ana@pharos.dev",
    ]);
    expect(some.total).toBe(1);
  });
});

describe("password reset by an administrator", () => {
  it("returns a 24-hour single-use link once; using it closes every session", async () => {
    const first = await register("first@pharos.dev", "Luis");
    const ana = await register("ana@pharos.dev", "Ana");
    const res = await resetFor(first, ana.user.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.delivery).toBe("link");
    expect(body.link).toBeUndefined(); // no APP_PUBLIC_URL on this server
    const hours = (new Date(body.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);

    const check = await app.inject({
      method: "POST",
      url: "/auth/reset/check",
      payload: { token: body.token },
    });
    expect(check.json()).toEqual({ email: "ana@pharos.dev", issuedBy: "Luis" });
    const done = await app.inject({
      method: "POST",
      url: "/auth/reset/confirm",
      payload: { token: body.token, newPassword: NEW_PASSWORD },
    });
    expect(done.statusCode).toBe(204);
    const twice = await app.inject({
      method: "POST",
      url: "/auth/reset/confirm",
      payload: { token: body.token, newPassword: "another-pass-1" },
    });
    expect(twice.json().code).toBe("invalid_reset_token");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/refresh",
          payload: { refreshToken: ana.refreshToken },
        })
      ).statusCode,
    ).toBe(401);

    expect(await accountEvents(first.user.id)).toContainEqual({
      event: "password_reset_issued",
      target: ana.user.id,
      delivery: "link",
    });
    const anaEvents = await accountEvents(ana.user.id);
    expect(anaEvents[0]).toEqual({
      event: "password_reset_issued",
      by: first.user.id,
      delivery: "link",
    });
    expect(anaEvents[1]).toMatchObject({
      event: "password_changed",
      method: "admin",
      issuedBy: first.user.id,
      sessionsClosed: 1,
    });
    expect(JSON.stringify(anaEvents)).not.toContain(body.token);
    expect(await notificationsOf(ana.user.id)).toEqual([
      "account.reset_issued",
    ]);
  });

  it("emails the link when asked: the administrator never sees it", async () => {
    const first = await register("first@pharos.dev", "Luis", mailApp);
    const ana = await register("ana@pharos.dev", "Ana", mailApp);
    const res = await resetFor(first, ana.user.id, "email", mailApp);
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeUndefined();
    expect(res.json().link).toBeUndefined();
    const mail = mailer.outbox.at(-1)!;
    expect(mail.to).toBe("ana@pharos.dev");
    expect(mail.text).toContain(
      "Luis, administrador del servidor qa.example.com",
    );
    expect(mail.text).toContain("24 horas");
    expect(mail.text).toContain("https://qa.example.com/#/restablecer?token=");
  });

  it("with an APP_PUBLIC_URL the hand-over answer carries the link", async () => {
    const first = await register("first@pharos.dev", "Luis", mailApp);
    const ana = await register("ana@pharos.dev", "Ana", mailApp);
    const body = (await resetFor(first, ana.user.id, "link", mailApp)).json();
    expect(body.link).toBe(
      `https://qa.example.com/#/restablecer?token=${body.token}`,
    );
    expect(mailer.outbox).toHaveLength(0);
  });

  it("cannot email without SMTP, nor reset oneself; may reset another administrator", async () => {
    const first = await register("first@pharos.dev");
    const ana = await register("ana@pharos.dev");
    expect((await resetFor(first, ana.user.id, "email")).json().code).toBe(
      "email_reset_disabled",
    );
    expect((await resetFor(first, first.user.id)).json().code).toBe(
      "admin_reset_self",
    );
    await setAdmin(first, ana.user.id, true);
    expect((await resetFor(first, ana.user.id)).statusCode).toBe(200);
    const missing = await resetFor(
      first,
      "00000000-0000-4000-8000-000000000000",
    );
    expect(missing.json().code).toBe("user_not_found");
  });

  it("a new link spends the open ones, the email ones too", async () => {
    const first = await register("first@pharos.dev");
    const ana = await register("ana@pharos.dev");
    const a = (await resetFor(first, ana.user.id)).json();
    const b = (await resetFor(first, ana.user.id)).json();
    const old = await app.inject({
      method: "POST",
      url: "/auth/reset/check",
      payload: { token: a.token },
    });
    expect(old.json().code).toBe("invalid_reset_token");
    const fresh = await app.inject({
      method: "POST",
      url: "/auth/reset/check",
      payload: { token: b.token },
    });
    expect(fresh.statusCode).toBe(200);
  });

  it("an email link names no administrator", async () => {
    await register("first@pharos.dev", "Luis", mailApp);
    await register("ana@pharos.dev", "Ana", mailApp);
    await mailApp.inject({
      method: "POST",
      url: "/auth/reset/request",
      payload: { email: "ana@pharos.dev" },
    });
    const token = decodeURIComponent(
      /token=([^\s"<]+)/.exec(mailer.outbox.at(-1)!.text)![1],
    );
    const check = await mailApp.inject({
      method: "POST",
      url: "/auth/reset/check",
      payload: { token },
    });
    expect(check.json()).toEqual({ email: "ana@pharos.dev", issuedBy: null });
  });
});
