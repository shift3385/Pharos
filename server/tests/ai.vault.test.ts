// AI key vault for the web (IA-12, ADR-0034): `/ai/web-access` and `/ai/chat`.
// The key used here is a fake one; the tests check it never comes back out:
// not in a response, an error, a log line or the database in clear.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { createVault } from "../src/modules/ai/vault";
import { chatCall, scrub } from "../src/modules/ai/providers";

const KEK = randomBytes(32).toString("base64");
const OTHER_KEK = randomBytes(32).toString("base64");
const FAKE_KEY = "sk-test-FAKEKEY0123456789abcdefghijklmnop";

interface Sent {
  url: string;
  init: RequestInit;
}

/** A provider that answers each call with the next reply. */
function fakeProvider(replies: Array<{ status: number; body: unknown } | "timeout" | "down">) {
  const sent: Sent[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    const next = replies.shift() ?? { status: 200, body: { choices: [{ message: { content: "ok" } }] } };
    if (next === "timeout") throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    if (next === "down") throw new TypeError(`fetch failed for ${url} with ${FAKE_KEY}`);
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as unknown as typeof fetch;
  return { impl, sent };
}

let logs = "";
const logStream = { write: (line: string) => void (logs += line) };

async function makeApp(overrides: Record<string, unknown>, aiFetch?: typeof fetch) {
  return setupTestApp(overrides, { aiFetch, logStream });
}

async function register(app: FastifyInstance, email: string): Promise<{ token: string; userId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "P", firstName: "A", lastName: "B" },
  });
  const body = res.json();
  return { token: body.accessToken as string, userId: body.user.id as string };
}

const headers = (t: string) => ({
  authorization: `Bearer ${t}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: SERVER_FEATURES.join(","),
});

const upload = (app: FastifyInstance, t: string, payload: unknown = { provider: "openai", model: "gpt-5", key: FAKE_KEY }) =>
  app.inject({ method: "PUT", url: "/ai/web-access", headers: headers(t), payload: payload as object });
const status = (app: FastifyInstance, t: string) => app.inject({ method: "GET", url: "/ai/web-access", headers: headers(t) });
const ask = (app: FastifyInstance, t: string, payload: unknown = { messages: [{ role: "user", content: "hola" }] }) =>
  app.inject({ method: "POST", url: "/ai/chat", headers: headers(t), payload: payload as object });

/** Neither the key nor a long piece of it. */
function expectNoKey(text: string) {
  expect(text).not.toContain(FAKE_KEY);
  expect(text).not.toContain(FAKE_KEY.slice(8, 28));
}

describe("vault encryption (ADR-0034)", () => {
  const vault = createVault(KEK);

  it("opens what it sealed, for the same user and provider only", () => {
    const sealed = vault.seal(FAKE_KEY, "user-a", "openai");
    expect(vault.open(sealed, "user-a", "openai")).toBe(FAKE_KEY);
    expect(vault.open(sealed, "user-b", "openai")).toBeNull();
    expect(vault.open(sealed, "user-a", "gemini")).toBeNull();
    expectNoKey(sealed.ciphertext.toString("latin1"));
  });

  it("uses a new nonce on every write", () => {
    const a = vault.seal(FAKE_KEY, "u", "openai");
    const b = vault.seal(FAKE_KEY, "u", "openai");
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it("does not open under another master key or when tampered with", () => {
    const sealed = vault.seal(FAKE_KEY, "u", "openai");
    const other = createVault(OTHER_KEK);
    expect(other.kekId).not.toBe(vault.kekId);
    expect(other.open({ ...sealed, kekId: other.kekId }, "u", "openai")).toBeNull();
    const tampered = Buffer.from(sealed.ciphertext);
    tampered[0] ^= 1;
    expect(vault.open({ ...sealed, ciphertext: tampered }, "u", "openai")).toBeNull();
  });

  it("the master key id does not reveal the master key", () => {
    expect(vault.kekId).toMatch(/^[0-9a-f]{16}$/);
    expect(Buffer.from(KEK, "base64").toString("hex")).not.toContain(vault.kekId);
  });
});

describe("provider calls", () => {
  it("puts the key in a header, never in the URL", () => {
    for (const provider of ["gemini", "openai", "anthropic", "openrouter"] as const) {
      const call = chatCall(provider, FAKE_KEY, "m-1", 0.5, [{ role: "user", content: "x" }]);
      expect(call.url).not.toContain(FAKE_KEY);
      expect(call.url.startsWith("https://")).toBe(true);
      expect(Object.values(call.headers).join(" ")).toContain(FAKE_KEY);
    }
  });

  it("scrubs the key and its ends out of a provider's message", () => {
    const text = `Incorrect API key provided: ${FAKE_KEY.slice(0, 12)}****${FAKE_KEY.slice(-8)}. Full: ${FAKE_KEY}`;
    const out = scrub(text, FAKE_KEY);
    expect(out).not.toContain(FAKE_KEY.slice(0, 12));
    expect(out).not.toContain(FAKE_KEY.slice(-8));
    expect(scrub("bad AIzaSyA1234567890abcdef key", "")).not.toContain("AIzaSy");
  });
});

describe("/ai/web-access and /ai/chat (IA-12)", () => {
  let app: FastifyInstance;
  let pool: Pool;
  let provider: ReturnType<typeof fakeProvider>;

  beforeAll(async () => {
    provider = fakeProvider([]);
    ({ app, pool } = await makeApp({ AI_VAULT_KEY: KEK }, provider.impl));
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(pool);
    provider.sent.length = 0;
    logs = "";
  });

  it("needs a session", async () => {
    for (const [method, url] of [
      ["GET", "/ai/web-access"],
      ["PUT", "/ai/web-access"],
      ["DELETE", "/ai/web-access"],
      ["POST", "/ai/chat"],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
    }
  });

  it("is off until the desktop uploads a key, and never returns the key", async () => {
    const { token } = await register(app, "a@pharos.dev");
    expect((await status(app, token)).json()).toEqual({
      available: true,
      enabled: false,
      provider: null,
      model: null,
      updatedAt: null,
      needsReupload: false,
    });
    const put = await upload(app, token);
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ available: true, enabled: true, provider: "openai", model: "gpt-5", needsReupload: false });
    expectNoKey(put.body);
    expectNoKey((await status(app, token)).body);
    expectNoKey(logs);
  });

  it("keeps the key encrypted in the database", async () => {
    const { token, userId } = await register(app, "a@pharos.dev");
    await upload(app, token);
    const { rows } = await pool.query("SELECT * FROM ai_vault WHERE user_id = $1", [userId]);
    expect(rows).toHaveLength(1);
    expectNoKey(JSON.stringify(rows[0]));
    expectNoKey((rows[0].ciphertext as Buffer).toString("latin1"));
  });

  it("each account reaches only its own key", async () => {
    const a = await register(app, "a@pharos.dev");
    const b = await register(app, "b@pharos.dev");
    await upload(app, a.token);
    expect((await status(app, b.token)).json().enabled).toBe(false);
    expect((await ask(app, b.token)).json().code).toBe("ai_web_access_off");
    // Moving A's row onto B does not give B the key: the ciphertext is bound to A.
    await pool.query(
      "INSERT INTO ai_vault (user_id, provider, model, nonce, ciphertext, kek_id) SELECT $2, provider, model, nonce, ciphertext, kek_id FROM ai_vault WHERE user_id = $1",
      [a.userId, b.userId],
    );
    const stolen = await ask(app, b.token);
    expect(stolen.statusCode).toBe(409);
    expect(stolen.json().code).toBe("ai_vault_reupload");
    expect(provider.sent).toHaveLength(0);
    // B removing its row leaves A's.
    expect((await app.inject({ method: "DELETE", url: "/ai/web-access", headers: headers(b.token) })).statusCode).toBe(204);
    expect((await status(app, a.token)).json().enabled).toBe(true);
  });

  it("calls the provider with the stored key and answers with its provenance", async () => {
    const { token } = await register(app, "a@pharos.dev");
    await upload(app, token);
    const res = await ask(app, token, { messages: [{ role: "user", content: "hola" }], temperature: 0.2 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ value: "ok", provider: "openai", model: "gpt-5" });
    expect(provider.sent).toHaveLength(1);
    const { url, init } = provider.sent[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(init.redirect).toBe("error");
    expectNoKey(res.body);
    expectNoKey(logs);
  });

  it("a provider error comes back without the key", async () => {
    const { token } = await register(app, "a@pharos.dev");
    await upload(app, token);
    provider.sent.length = 0;
    const p = fakeProvider([
      { status: 401, body: { error: { message: `Incorrect API key provided: ${FAKE_KEY}` } } },
    ]);
    // A dedicated app so the reply queue is this test's.
    const { app: app2, pool: pool2 } = await makeApp({ AI_VAULT_KEY: KEK }, p.impl);
    try {
      const res = await ask(app2, token);
      expect(res.statusCode).toBe(502);
      expect(res.json()).toMatchObject({ code: "ai_provider_error", kind: "key_rejected", provider: "openai" });
      expectNoKey(res.body);
    } finally {
      await app2.close();
      await pool2.end();
    }
    expectNoKey(logs);
  });

  it("an unreachable provider or a timeout says so, without the key or the URL", async () => {
    const { token } = await register(app, "a@pharos.dev");
    await upload(app, token);
    const p = fakeProvider(["down", "timeout"]);
    const { app: app2, pool: pool2 } = await makeApp({ AI_VAULT_KEY: KEK }, p.impl);
    try {
      const down = await ask(app2, token);
      expect(down.statusCode).toBe(502);
      expect(down.json().kind).toBe("unreachable");
      expectNoKey(down.body);
      const slow = await ask(app2, token);
      expect(slow.statusCode).toBe(504);
      expect(slow.json().kind).toBe("timeout");
    } finally {
      await app2.close();
      await pool2.end();
    }
    expectNoKey(logs);
  });

  it("invalid input is refused without quoting what was sent", async () => {
    const { token } = await register(app, "a@pharos.dev");
    const badModel = await upload(app, token, { provider: "openai", model: "../../x y", key: FAKE_KEY });
    expect(badModel.statusCode).toBe(400);
    expectNoKey(badModel.body);
    const custom = await upload(app, token, { provider: "custom", model: "m", key: FAKE_KEY });
    expect(custom.statusCode).toBe(400);
    expectNoKey(custom.body);
    const malformed = await app.inject({
      method: "PUT",
      url: "/ai/web-access",
      headers: { ...headers(token), "content-type": "application/json" },
      payload: `{"provider":"openai","model":"gpt-5","key":"${FAKE_KEY}"`,
    });
    expect(malformed.statusCode).toBe(400);
    expectNoKey(malformed.body);
    expectNoKey(logs);
  });

  it("removing the key stops the web from using it", async () => {
    const { token } = await register(app, "a@pharos.dev");
    await upload(app, token);
    expect((await app.inject({ method: "DELETE", url: "/ai/web-access", headers: headers(token) })).statusCode).toBe(204);
    expect((await status(app, token)).json().enabled).toBe(false);
    expect((await ask(app, token)).json().code).toBe("ai_web_access_off");
  });

  it("the key goes with the account", async () => {
    // A user row cannot be deleted while it owns workspaces (W); whatever
    // deletes an account, the vault row goes with it.
    const { rows } = await pool.query(
      `SELECT confdeltype FROM pg_constraint WHERE conrelid = 'ai_vault'::regclass AND contype = 'f'`,
    );
    expect(rows).toEqual([{ confdeltype: "c" }]);
    const { token, userId } = await register(app, "a@pharos.dev");
    await upload(app, token);
    await pool.query("TRUNCATE users CASCADE");
    expect((await pool.query("SELECT 1 FROM ai_vault WHERE user_id = $1", [userId])).rowCount).toBe(0);
  });
});

describe("server configuration", () => {
  it("without AI_VAULT_KEY nothing is stored, and a stored key can still be removed", async () => {
    const { app, pool } = await makeApp({ AI_VAULT_KEY: undefined });
    try {
      await truncateAll(pool);
      const { token } = await register(app, "a@pharos.dev");
      expect((await status(app, token)).json()).toMatchObject({ available: false, enabled: false });
      const put = await upload(app, token);
      expect(put.statusCode).toBe(503);
      expect(put.json().code).toBe("ai_vault_disabled");
      expectNoKey(put.body);
      expect((await ask(app, token)).json().code).toBe("ai_vault_disabled");
      expect((await app.inject({ method: "DELETE", url: "/ai/web-access", headers: headers(token) })).statusCode).toBe(204);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("after the master key changes, the stored key must be uploaded again", async () => {
    const first = await makeApp({ AI_VAULT_KEY: KEK });
    await truncateAll(first.pool);
    const { token } = await register(first.app, "a@pharos.dev");
    await upload(first.app, token);
    await first.app.close();
    await first.pool.end();

    const p = fakeProvider([]);
    const { app, pool } = await makeApp({ AI_VAULT_KEY: OTHER_KEK }, p.impl);
    try {
      expect((await status(app, token)).json()).toMatchObject({ enabled: true, needsReupload: true });
      const res = await ask(app, token);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("ai_vault_reupload");
      expect(p.sent).toHaveLength(0);
      await upload(app, token);
      expect((await status(app, token)).json().needsReupload).toBe(false);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("limits AI requests and key uploads per account, not per server", async () => {
    const p = fakeProvider([]);
    const { app, pool } = await makeApp(
      { AI_VAULT_KEY: KEK, AI_CHAT_RATE_LIMIT_MAX: 2, AI_VAULT_RATE_LIMIT_MAX: 2 },
      p.impl,
    );
    try {
      await truncateAll(pool);
      const a = await register(app, "a@pharos.dev");
      const b = await register(app, "b@pharos.dev");
      await upload(app, a.token);
      await upload(app, b.token);
      expect((await upload(app, a.token)).statusCode).toBe(200);
      expect((await upload(app, a.token)).statusCode).toBe(429);
      expect((await ask(app, a.token)).statusCode).toBe(200);
      expect((await ask(app, a.token)).statusCode).toBe(200);
      const limited = await ask(app, a.token);
      expect(limited.statusCode).toBe(429);
      expect(limited.json().code).toBe("rate_limited");
      // B has its own budget.
      expect((await ask(app, b.token)).statusCode).toBe(200);
    } finally {
      await app.close();
      await pool.end();
    }
  });
});

describe("transport", () => {
  it("in production the key routes refuse plain http (SEC-07)", async () => {
    const { app, pool } = await makeApp({ AI_VAULT_KEY: KEK, NODE_ENV: "production" });
    try {
      for (const [method, url] of [
        ["PUT", "/ai/web-access"],
        ["POST", "/ai/chat"],
      ] as const) {
        const res = await app.inject({
          method,
          url,
          remoteAddress: "10.0.0.5",
          payload: { provider: "openai", model: "gpt-5", key: FAKE_KEY },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().code).toBe("https_required");
        expectNoKey(res.body);
      }
    } finally {
      await app.close();
      await pool.end();
    }
  });
});
