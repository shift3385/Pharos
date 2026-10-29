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

  it("the default sync limit fits a full push batch of 1,000 deltas", () => {
    const delta = {
      entity: "test_case",
      entityId: "00000000-0000-4000-8000-000000000000",
      op: "upsert",
      payload: { title: "t".repeat(100), steps: "s".repeat(4_000) },
      revision: 12,
      author: "00000000-0000-4000-8000-000000000001",
      hlc: "1761696000000:0000:device-0000000000000000",
    };
    const batch = JSON.stringify({ deltas: Array(1000).fill(delta) });
    expect(Buffer.byteLength(batch)).toBeLessThan(
      testEnv.SYNC_BODY_LIMIT_BYTES,
    );
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
