import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { buildApp } from "../src/app";
import { createMemoryMailer } from "../src/modules/auth/mailer";
import { createVault } from "../src/modules/ai";
import {
  SERVER_VERSION,
  VERSION_HEADER,
} from "../src/modules/sync/sync.version";
import { setupTestApp, testEnv, truncateAll } from "./helpers";

// IA-12 (ADR-0034) with SEC-08/SEC-09 (ADR-0045): recovering the account
// deletes the AI key stored for the web; a change from the profile keeps it.

const KEK = randomBytes(32).toString("base64");
// Never a real key: a made-up value only this test knows.
const FAKE_KEY = `fake-${randomBytes(12).toString("hex")}`;
const PASSWORD = "supersecret1";
const NEW_PASSWORD = "a-much-longer-passphrase";

let app: FastifyInstance;
let mailApp: FastifyInstance;
let pool: Pool;
const mailer = createMemoryMailer();

beforeAll(async () => {
  ({ app, pool } = await setupTestApp({ AI_VAULT_KEY: KEK }));
  mailApp = buildApp({
    pool,
    env: {
      ...testEnv,
      AI_VAULT_KEY: KEK,
      APP_PUBLIC_URL: "https://qa.example.com/",
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

/** Stores a sealed key for the user, as an upload from the desktop would. */
async function storeKey(userId: string) {
  const sealed = createVault(KEK).seal(FAKE_KEY, userId, "openai");
  await pool.query(
    `INSERT INTO ai_vault (user_id, provider, model, nonce, ciphertext, kek_id) VALUES ($1, 'openai', 'gpt-4o-mini', $2, $3, $4)`,
    [userId, sealed.nonce, sealed.ciphertext, sealed.kekId],
  );
}

const hasKey = async (userId: string) =>
  (await pool.query("SELECT 1 FROM ai_vault WHERE user_id = $1", [userId]))
    .rowCount === 1;

async function lastAccountSummary(userId: string) {
  const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
    `SELECT d.payload FROM documents d
       JOIN workspaces w ON w.id = d.workspace_id AND w.kind = 'personal' AND w.created_by = $1
      WHERE d.entity = 'audit_event' AND d.payload->>'entity' = 'account'
      ORDER BY (d.payload->>'chainSeq')::bigint`,
    [userId],
  );
  expect(JSON.stringify(rows)).not.toContain(FAKE_KEY);
  return JSON.parse(String(rows.at(-1)!.payload.summary)) as Record<
    string,
    unknown
  >;
}

describe("account recovery and the AI key for the web (IA-12)", () => {
  it("a recovery code deletes the stored key and says so in the audit event", async () => {
    const s = await register();
    const other = await register("other@pharos.dev");
    await storeKey(s.user.id);
    await storeKey(other.user.id);
    const res = await app.inject({
      method: "POST",
      url: "/auth/recover",
      payload: {
        email: "qa@pharos.dev",
        code: s.recoveryCodes[0],
        newPassword: NEW_PASSWORD,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(await hasKey(s.user.id)).toBe(false);
    expect(await hasKey(other.user.id)).toBe(true);
    expect(await lastAccountSummary(s.user.id)).toEqual({
      event: "password_changed",
      method: "recovery_code",
      sessionsClosed: 1,
      codesRemaining: 9,
      aiWebKeyRemoved: true,
    });
    const web = await app.inject({
      method: "GET",
      url: "/ai/web-access",
      headers: {
        authorization: `Bearer ${res.json().accessToken}`,
        [VERSION_HEADER]: SERVER_VERSION,
      },
    });
    expect(web.json()).toMatchObject({ enabled: false });
  });

  it("without a stored key, recovery leaves the event as before", async () => {
    const s = await register();
    await app.inject({
      method: "POST",
      url: "/auth/recover",
      payload: {
        email: "qa@pharos.dev",
        code: s.recoveryCodes[0],
        newPassword: NEW_PASSWORD,
      },
    });
    expect(await lastAccountSummary(s.user.id)).not.toHaveProperty(
      "aiWebKeyRemoved",
    );
  });

  it("an email link deletes the stored key", async () => {
    const s = await register();
    await storeKey(s.user.id);
    await mailApp.inject({
      method: "POST",
      url: "/auth/reset/request",
      payload: { email: "qa@pharos.dev" },
    });
    const token = decodeURIComponent(
      /token=([^\s"<]+)/.exec(mailer.outbox.at(-1)!.text)![1],
    );
    const done = await mailApp.inject({
      method: "POST",
      url: "/auth/reset/confirm",
      payload: { token, newPassword: NEW_PASSWORD },
    });
    expect(done.statusCode).toBe(204);
    expect(await hasKey(s.user.id)).toBe(false);
    expect(await lastAccountSummary(s.user.id)).toEqual({
      event: "password_changed",
      method: "email_link",
      sessionsClosed: 1,
      aiWebKeyRemoved: true,
    });
  });

  it("a link an administrator issued deletes the stored key", async () => {
    const s = await register();
    const admin = await register("admin@pharos.dev");
    await storeKey(s.user.id);
    const token = randomBytes(32).toString("base64url");
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, issued_by)
       VALUES ($1, $2, now() + interval '30 minutes', $3)`,
      [
        s.user.id,
        createHash("sha256").update(token).digest("hex"),
        admin.user.id,
      ],
    );
    const done = await app.inject({
      method: "POST",
      url: "/auth/reset/confirm",
      payload: { token, newPassword: NEW_PASSWORD },
    });
    expect(done.statusCode).toBe(204);
    expect(await hasKey(s.user.id)).toBe(false);
    expect(await lastAccountSummary(s.user.id)).toMatchObject({
      method: "admin",
      aiWebKeyRemoved: true,
    });
  });

  it("a password change from the profile keeps the stored key", async () => {
    const s = await register();
    await storeKey(s.user.id);
    const res = await app.inject({
      method: "POST",
      url: "/auth/password",
      headers: { authorization: `Bearer ${s.accessToken}` },
      payload: {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
        refreshToken: s.refreshToken,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(await hasKey(s.user.id)).toBe(true);
    expect(await lastAccountSummary(s.user.id)).toEqual({
      event: "password_changed",
      method: "profile",
      sessionsClosed: 0,
    });
  });
});
