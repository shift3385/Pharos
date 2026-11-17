import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { buildApp } from "../src/app";
import { createMemoryMailer } from "../src/modules/auth/mailer";
import {
  generateRecoveryCodes,
  normalizeRecoveryCode,
} from "../src/modules/auth/recovery-codes";
import { setupTestApp, testEnv, truncateAll } from "./helpers";

// Changing and recovering the account password (SEC-08, SEC-09 by email;
// ADR-0045).

let app: FastifyInstance; // no SMTP: email reset off (the default)
let mailApp: FastifyInstance; // with a memory mailer
let pool: Pool;
const mailer = createMemoryMailer();

beforeAll(async () => {
  ({ app, pool } = await setupTestApp());
  mailApp = buildApp({
    pool,
    env: { ...testEnv, APP_PUBLIC_URL: "https://qa.example.com/" },
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

async function register(email = "qa@pharos.dev") {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email,
      password: PASSWORD,
      displayName: "QA",
      firstName: "Ana",
      lastName: "Pérez",
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
    recoveryCodes: string[];
  };
}

const login = (password: string, email = "qa@pharos.dev") =>
  app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
const refresh = (refreshToken: string) =>
  app.inject({
    method: "POST",
    url: "/auth/refresh",
    payload: { refreshToken },
  });
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** The account events of a user's web audit chain. */
async function accountEvents(userId: string) {
  const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
    `SELECT payload FROM documents WHERE user_id = $1 AND entity = 'audit_event'
        AND payload->>'entity' = 'account' ORDER BY (payload->>'chainSeq')::bigint`,
    [userId],
  );
  return rows.map((r) => ({
    ...r.payload,
    summary: JSON.parse(String(r.payload.summary)) as Record<string, unknown>,
  }));
}

describe("recovery codes", () => {
  it("formats, normalizes and draws codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes)
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(normalizeRecoveryCode(" 7k2qd m9xrt ")).toBe("7K2QDM9XRT");
    expect(normalizeRecoveryCode("oooooiiiil")).toBe("0000011111");
    expect(normalizeRecoveryCode("ABCDE-FGHJ")).toBeNull();
    expect(normalizeRecoveryCode("ABCDE-FGHJU")).toBeNull();
  });

  it("are returned once at sign-up and stored only as hashes", async () => {
    const s = await register();
    expect(s.recoveryCodes).toHaveLength(10);
    const { rows } = await pool.query<{ code_hash: string }>(
      "SELECT code_hash FROM account_recovery_codes WHERE user_id = $1",
      [s.user.id],
    );
    expect(rows).toHaveLength(10);
    for (const r of rows) {
      expect(r.code_hash.startsWith("$argon2id$")).toBe(true);
      for (const c of s.recoveryCodes)
        expect(r.code_hash).not.toContain(c.replace("-", ""));
    }
    const status = await app.inject({
      method: "GET",
      url: "/auth/recovery-codes",
      headers: auth(s.accessToken),
    });
    expect(status.json()).toMatchObject({
      total: 10,
      remaining: 10,
      lastUsedAt: null,
    });
    expect(JSON.stringify(status.json())).not.toContain(s.recoveryCodes[0]);
    // Creating the account leaves no event (a new account syncs nothing).
    expect(await accountEvents(s.user.id)).toEqual([]);
  });

  it("can be generated again with the current password; the old ones stop working", async () => {
    const s = await register();
    const wrong = await app.inject({
      method: "POST",
      url: "/auth/recovery-codes",
      headers: auth(s.accessToken),
      payload: { currentPassword: "nope-nope" },
    });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json().code).toBe("wrong_password");

    const res = await app.inject({
      method: "POST",
      url: "/auth/recovery-codes",
      headers: auth(s.accessToken),
      payload: { currentPassword: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const fresh = res.json().recoveryCodes as string[];
    expect(fresh).toHaveLength(10);
    expect((await accountEvents(s.user.id)).map((e) => e.summary)).toEqual([
      { event: "recovery_codes_generated", codes: 10 },
    ]);

    const old = await app.inject({
      method: "POST",
      url: "/auth/recover",
      payload: {
        email: "qa@pharos.dev",
        code: s.recoveryCodes[0],
        newPassword: NEW_PASSWORD,
      },
    });
    expect(old.json().code).toBe("invalid_recovery");
    const ok = await app.inject({
      method: "POST",
      url: "/auth/recover",
      payload: {
        email: "qa@pharos.dev",
        code: fresh[0],
        newPassword: NEW_PASSWORD,
      },
    });
    expect(ok.statusCode).toBe(200);
  });
});

describe("change password from the profile", () => {
  it("needs the current password and a different new one", async () => {
    const s = await register();
    const send = (payload: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: "/auth/password",
        headers: auth(s.accessToken),
        payload,
      });
    expect(
      (
        await send({ currentPassword: "wrong-one", newPassword: NEW_PASSWORD })
      ).json().code,
    ).toBe("wrong_password");
    expect(
      (await send({ currentPassword: PASSWORD, newPassword: PASSWORD })).json()
        .code,
    ).toBe("same_password");
    expect(
      (await send({ currentPassword: PASSWORD, newPassword: "short" })).json()
        .code,
    ).toBe("validation_error");
    const anon = await app.inject({
      method: "POST",
      url: "/auth/password",
      payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(anon.statusCode).toBe(401);
  });

  it("keeps this session, closes the others and leaves an audit event without secrets", async () => {
    const s = await register();
    const other = (await login(PASSWORD)).json();
    const res = await app.inject({
      method: "POST",
      url: "/auth/password",
      headers: auth(s.accessToken),
      payload: {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
        refreshToken: s.refreshToken,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sessionsClosed: 1 });

    expect((await refresh(s.refreshToken)).statusCode).toBe(200);
    expect((await refresh(other.refreshToken)).statusCode).toBe(401);
    expect((await login(PASSWORD)).statusCode).toBe(401);
    expect((await login(NEW_PASSWORD)).statusCode).toBe(200);

    const events = await accountEvents(s.user.id);
    const last = events.at(-1)!;
    expect(last).toMatchObject({
      action: "update",
      entity: "account",
      entityId: s.user.id,
      actor: `user:${s.user.id}`,
    });
    expect(last.summary).toEqual({
      event: "password_changed",
      method: "profile",
      sessionsClosed: 1,
    });
    const text = JSON.stringify(events);
    for (const secret of [
      PASSWORD,
      NEW_PASSWORD,
      s.refreshToken,
      ...s.recoveryCodes,
    ])
      expect(text).not.toContain(secret);
  });
});

describe("recover with a code", () => {
  it("sets the password, spends the code, closes every session and signs in", async () => {
    const s = await register();
    const res = await app.inject({
      method: "POST",
      url: "/auth/recover",
      payload: {
        email: "QA@pharos.dev",
        code: s.recoveryCodes[3].toLowerCase(),
        newPassword: NEW_PASSWORD,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.recoveryCodesRemaining).toBe(9);
    expect((await refresh(s.refreshToken)).statusCode).toBe(401);
    expect((await refresh(body.refreshToken)).statusCode).toBe(200);
    expect((await login(NEW_PASSWORD)).statusCode).toBe(200);

    const again = await app.inject({
      method: "POST",
      url: "/auth/recover",
      payload: {
        email: "qa@pharos.dev",
        code: s.recoveryCodes[3],
        newPassword: "yet-another-pass",
      },
    });
    expect(again.json().code).toBe("invalid_recovery");

    const last = (await accountEvents(s.user.id)).at(-1)!;
    expect(last.summary).toEqual({
      event: "password_changed",
      method: "recovery_code",
      sessionsClosed: 1,
      codesRemaining: 9,
    });
  });

  it("answers the same for an unknown email and a wrong code", async () => {
    await register();
    const unknown = await app.inject({
      method: "POST",
      url: "/auth/recover",
      payload: {
        email: "nobody@pharos.dev",
        code: "7K2QD-M9XRT",
        newPassword: NEW_PASSWORD,
      },
    });
    const wrong = await app.inject({
      method: "POST",
      url: "/auth/recover",
      payload: {
        email: "qa@pharos.dev",
        code: "7K2QD-M9XRT",
        newPassword: NEW_PASSWORD,
      },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toEqual(wrong.json());
  });

  it("locks recovery by code after five wrong codes, even with a right one", async () => {
    const s = await register();
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/recover",
        payload: {
          email: "qa@pharos.dev",
          code: "00000-00000",
          newPassword: NEW_PASSWORD,
        },
      });
      expect(res.json().code).toBe("invalid_recovery");
    }
    const locked = await app.inject({
      method: "POST",
      url: "/auth/recover",
      payload: {
        email: "qa@pharos.dev",
        code: s.recoveryCodes[0],
        newPassword: NEW_PASSWORD,
      },
    });
    expect(locked.statusCode).toBe(429);
    expect((await login(PASSWORD)).statusCode).toBe(200);
  });
});

describe("reset by email", () => {
  it("is off without SMTP", async () => {
    await register();
    expect(
      (await app.inject({ method: "GET", url: "/auth/capabilities" })).json(),
    ).toEqual({ emailReset: false });
    const res = await app.inject({
      method: "POST",
      url: "/auth/reset/request",
      payload: { email: "qa@pharos.dev" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("email_reset_disabled");
  });

  async function requestLink(locale?: "es" | "en") {
    const res = await mailApp.inject({
      method: "POST",
      url: "/auth/reset/request",
      payload: { email: "qa@pharos.dev", locale },
    });
    expect(res.statusCode).toBe(202);
    const mail = mailer.outbox.at(-1)!;
    const token = decodeURIComponent(/token=([^\s"<]+)/.exec(mail.text)![1]);
    return { mail, token };
  }

  it("emails a single-use link built from APP_PUBLIC_URL", async () => {
    const s = await register();
    expect(
      (
        await mailApp.inject({ method: "GET", url: "/auth/capabilities" })
      ).json(),
    ).toEqual({ emailReset: true });
    const { mail, token } = await requestLink("en");
    expect(mail.to).toBe("qa@pharos.dev");
    expect(mail.subject).toBe("Reset your Pharos password");
    expect(mail.text).toContain("https://qa.example.com/#/restablecer?token=");
    expect(mail.text).toContain("30 minutes");

    const { rows } = await pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM password_reset_tokens",
    );
    expect(rows[0].token_hash).not.toBe(token);

    const check = await mailApp.inject({
      method: "POST",
      url: "/auth/reset/check",
      payload: { token },
    });
    expect(check.json()).toEqual({ email: "qa@pharos.dev" });

    const done = await mailApp.inject({
      method: "POST",
      url: "/auth/reset/confirm",
      payload: { token, newPassword: NEW_PASSWORD },
    });
    expect(done.statusCode).toBe(204);
    expect((await refresh(s.refreshToken)).statusCode).toBe(401);
    expect((await login(NEW_PASSWORD)).statusCode).toBe(200);

    const twice = await mailApp.inject({
      method: "POST",
      url: "/auth/reset/confirm",
      payload: { token, newPassword: "another-pass-1" },
    });
    expect(twice.json().code).toBe("invalid_reset_token");

    const summaries = (await accountEvents(s.user.id)).map((e) => e.summary);
    expect(summaries.slice(-2)).toEqual([
      { event: "password_reset_requested", method: "email_link" },
      { event: "password_changed", method: "email_link", sessionsClosed: 1 },
    ]);
    expect(JSON.stringify(summaries)).not.toContain(token);
  });

  it("answers the same for an unknown email and sends nothing", async () => {
    const res = await mailApp.inject({
      method: "POST",
      url: "/auth/reset/request",
      payload: { email: "nobody@pharos.dev" },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: "sent_if_registered" });
    expect(mailer.outbox).toHaveLength(0);
  });

  it("sends at most one email a minute; a new link spends the old one", async () => {
    await register();
    const first = await requestLink();
    expect(first.mail.subject).toBe("Restablecer tu contraseña de Pharos");
    await mailApp.inject({
      method: "POST",
      url: "/auth/reset/request",
      payload: { email: "qa@pharos.dev" },
    });
    expect(mailer.outbox).toHaveLength(1);

    await pool.query(
      "UPDATE password_reset_tokens SET created_at = now() - interval '2 minutes'",
    );
    const second = await requestLink();
    expect(mailer.outbox).toHaveLength(2);
    const old = await mailApp.inject({
      method: "POST",
      url: "/auth/reset/confirm",
      payload: { token: first.token, newPassword: NEW_PASSWORD },
    });
    expect(old.json().code).toBe("invalid_reset_token");
    const ok = await mailApp.inject({
      method: "POST",
      url: "/auth/reset/confirm",
      payload: { token: second.token, newPassword: NEW_PASSWORD },
    });
    expect(ok.statusCode).toBe(204);
  });

  it("refuses an expired link, and a password change spends open links", async () => {
    const s = await register();
    const { token } = await requestLink();
    await pool.query(
      "UPDATE password_reset_tokens SET expires_at = now() - interval '1 second'",
    );
    const expired = await mailApp.inject({
      method: "POST",
      url: "/auth/reset/check",
      payload: { token },
    });
    expect(expired.json().code).toBe("invalid_reset_token");

    await pool.query(
      "UPDATE password_reset_tokens SET created_at = now() - interval '2 minutes'",
    );
    const open = await requestLink();
    await app.inject({
      method: "POST",
      url: "/auth/password",
      headers: auth(s.accessToken),
      payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    const spent = await mailApp.inject({
      method: "POST",
      url: "/auth/reset/confirm",
      payload: { token: open.token, newPassword: "another-pass-1" },
    });
    expect(spent.json().code).toBe("invalid_reset_token");
  });
});
