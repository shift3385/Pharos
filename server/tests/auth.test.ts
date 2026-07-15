import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";

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

const validUser = {
  email: "QA@Pharos.dev",
  password: "supersecret1",
  displayName: "Shift",
  firstName: "Liomar",
  lastName: "Rodriguez",
};

function register(overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { ...validUser, ...overrides },
  });
}

describe("auth", () => {
  it("registers a user and returns a session (email normalized)", async () => {
    const res = await register();
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.email).toBe("qa@pharos.dev");
    expect(body.user.firstName).toBe("Liomar");
    expect(body.user).not.toHaveProperty("password_hash");
  });

  it("rejects a duplicate email with 409", async () => {
    await register();
    const res = await register();
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("email_in_use");
  });

  it("rejects invalid input with 400", async () => {
    const res = await register({ password: "short" });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("validation_error");
  });

  it("logs in with correct credentials", async () => {
    await register();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "qa@pharos.dev", password: validUser.password },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
  });

  it("rejects a wrong password with 401", async () => {
    await register();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "qa@pharos.dev", password: "wrongpass1" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("invalid_credentials");
  });

  it("returns the current user for a valid access token", async () => {
    const reg = (await register()).json();
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${reg.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe("qa@pharos.dev");
  });

  it("rejects /auth/me without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("rotates the refresh token and invalidates the old one", async () => {
    const reg = (await register()).json();

    const rotated = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: reg.refreshToken },
    });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().refreshToken).not.toBe(reg.refreshToken);

    const reuseOld = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: reg.refreshToken },
    });
    expect(reuseOld.statusCode).toBe(401);

    const useNew = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: rotated.json().refreshToken },
    });
    expect(useNew.statusCode).toBe(200);
  });

  it("logs out and invalidates the refresh token", async () => {
    const reg = (await register()).json();
    const out = await app.inject({
      method: "POST",
      url: "/auth/logout",
      payload: { refreshToken: reg.refreshToken },
    });
    expect(out.statusCode).toBe(204);

    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: reg.refreshToken },
    });
    expect(res.statusCode).toBe(401);
  });
});
