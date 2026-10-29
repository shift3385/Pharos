import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { buildApp } from "../src/app";
import { createPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { TEST_DATABASE_URL, testEnv } from "./helpers";

// BASE-06: login/register attempt limit, request body limits, and Fastify's
// own client errors mapped to 4xx instead of 500. Small limits keep it fast.
let app: FastifyInstance;
let pool: Pool;

beforeAll(async () => {
  pool = createPool(TEST_DATABASE_URL);
  await runMigrations(pool);
  app = buildApp({
    pool,
    env: {
      ...testEnv,
      LOGIN_RATE_LIMIT_MAX: 3,
      BODY_LIMIT_BYTES: 16 * 1024,
      SYNC_BODY_LIMIT_BYTES: 64 * 1024,
    },
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

const login = (ip: string) =>
  app.inject({
    method: "POST",
    url: "/auth/login",
    remoteAddress: ip,
    payload: { email: "nobody@pharos.dev", password: "wrong-password" },
  });

/** A JSON body of roughly `bytes` bytes. */
const bodyOf = (bytes: number) => ({ deltas: [], filler: "x".repeat(bytes) });

describe("login attempt limit", () => {
  it("answers 429 rate_limited after LOGIN_RATE_LIMIT_MAX attempts from one IP", async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await login("10.0.0.1")).statusCode).toBe(401);
    }
    const res = await login("10.0.0.1");
    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe("rate_limited");
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("counts each client IP separately", async () => {
    expect((await login("10.0.0.2")).statusCode).toBe(401);
  });

  it("also limits /auth/register, but not other routes", async () => {
    const register = () =>
      app.inject({
        method: "POST",
        url: "/auth/register",
        remoteAddress: "10.0.0.3",
        payload: {},
      });
    for (let i = 0; i < 3; i += 1) {
      expect((await register()).statusCode).toBe(400);
    }
    expect((await register()).statusCode).toBe(429);
    for (let i = 0; i < 5; i += 1) {
      const res = await app.inject({
        method: "GET",
        url: "/health",
        remoteAddress: "10.0.0.3",
      });
      expect(res.statusCode).toBe(200);
    }
  });
});

describe("request body limits", () => {
  it("rejects a body above BODY_LIMIT_BYTES on non-sync routes with 413", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: bodyOf(20 * 1024),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe("payload_too_large");
  });

  it("lets /sync/* bodies grow up to SYNC_BODY_LIMIT_BYTES", async () => {
    // 32 KiB: above the general limit, below the sync one → reaches auth (401).
    const ok = await app.inject({
      method: "POST",
      url: "/sync/push",
      payload: bodyOf(32 * 1024),
    });
    expect(ok.statusCode).toBe(401);

    const tooBig = await app.inject({
      method: "POST",
      url: "/sync/push",
      payload: bodyOf(80 * 1024),
    });
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.json().code).toBe("payload_too_large");
  });

  it("the default sync limit fits a full push batch (500 deltas, the server cap)", () => {
    const delta = {
      entity: "test_case",
      entityId: "00000000-0000-4000-8000-000000000000",
      op: "upsert",
      payload: { title: "t".repeat(100), steps: "s".repeat(8_000) },
      revision: 12,
      author: "00000000-0000-4000-8000-000000000001",
      hlc: "1761696000000:0000:device-0000000000000000",
    };
    const batch = JSON.stringify({ deltas: Array(500).fill(delta) });
    expect(Buffer.byteLength(batch)).toBeLessThan(
      testEnv.SYNC_BODY_LIMIT_BYTES,
    );
    // The desktop client sends at most 512 KiB per push (track A1).
    expect(512 * 1024).toBeLessThan(testEnv.SYNC_BODY_LIMIT_BYTES);
  });

  it("does not affect a sync GET (no body)", async () => {
    const res = await app.inject({ method: "GET", url: "/sync/pull" });
    expect(res.statusCode).toBe(401);
  });
});

describe("route policies apply to routes added later by other plugins", () => {
  let extra: FastifyInstance;

  beforeAll(async () => {
    extra = buildApp({
      pool,
      env: {
        ...testEnv,
        BODY_LIMIT_BYTES: 16 * 1024,
        SYNC_BODY_LIMIT_BYTES: 64 * 1024,
      },
    });
    // A sync route registered under a prefix, as a future module would.
    void extra.register(
      async (instance) => {
        instance.post("/echo", async () => ({ ok: true }));
      },
      { prefix: "/sync" },
    );
    void extra.register(async (instance) => {
      instance.get("/forbidden", async () => {
        throw Object.assign(new Error("no"), { statusCode: 403 });
      });
      instance.get("/teapot", async () => {
        throw Object.assign(new Error("short and stout"), { statusCode: 418 });
      });
    });
    await extra.ready();
  });
  afterAll(async () => {
    await extra.close();
  });

  it("a prefixed /sync/* route gets the sync body limit", async () => {
    const ok = await extra.inject({
      method: "POST",
      url: "/sync/echo",
      payload: bodyOf(32 * 1024),
    });
    expect(ok.statusCode).toBe(200);
    const tooBig = await extra.inject({
      method: "POST",
      url: "/sync/echo",
      payload: bodyOf(80 * 1024),
    });
    expect(tooBig.statusCode).toBe(413);
  });

  it("maps other 4xx errors to a stable code", async () => {
    const forbidden = await extra.inject({ method: "GET", url: "/forbidden" });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().code).toBe("forbidden");
    const teapot = await extra.inject({ method: "GET", url: "/teapot" });
    expect(teapot.statusCode).toBe(418);
    expect(teapot.json().code).toBe("client_error");
  });
});

describe("TRUST_PROXY", () => {
  const loginVia = (target: FastifyInstance, forwardedFor: string) =>
    target.inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: "10.9.9.9", // the reverse proxy
      headers: { "x-forwarded-for": forwardedFor },
      payload: { email: "nobody@pharos.dev", password: "wrong-password" },
    });

  it("off (default): every client behind the proxy shares one limit", async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await loginVia(app, `203.0.113.${i}`)).statusCode).toBe(401);
    }
    expect((await loginVia(app, "203.0.113.99")).statusCode).toBe(429);
  });

  it("on: the limit counts the client IP from X-Forwarded-For", async () => {
    const proxied = buildApp({
      pool,
      env: { ...testEnv, TRUST_PROXY: true, LOGIN_RATE_LIMIT_MAX: 3 },
    });
    await proxied.ready();
    try {
      for (let i = 0; i < 5; i += 1) {
        expect((await loginVia(proxied, `198.51.100.${i}`)).statusCode).toBe(
          401,
        );
      }
      for (let i = 0; i < 3; i += 1) {
        expect((await loginVia(proxied, "198.51.100.200")).statusCode).toBe(
          401,
        );
      }
      expect((await loginVia(proxied, "198.51.100.200")).statusCode).toBe(429);
    } finally {
      await proxied.close();
    }
  });
});

describe("client errors", () => {
  it("answers 400 bad_request (not 500) to malformed JSON", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: "10.0.0.9",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("bad_request");
  });

  it("answers 415 to an unsupported content type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: { "content-type": "application/xml" },
      payload: "<x/>",
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().code).toBe("unsupported_media_type");
  });
});
