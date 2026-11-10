// Preferences of an account (UX-27, ADR-0038): `GET`/`PUT
// /api/me/preferences/:key`. Each account has its own; the newest change wins.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { MAX_VALUE_BYTES } from "../src/modules/preferences/preferences";

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

async function token(email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "P", firstName: "A", lastName: "B" },
  });
  return res.json().accessToken as string;
}

const headers = (t: string) => ({
  authorization: `Bearer ${t}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: SERVER_FEATURES.join(","),
});
const URL = "/api/me/preferences/home.board";
const get = (t: string, url = URL) => app.inject({ method: "GET", url, headers: headers(t) });
const put = (t: string, value: unknown, updatedAt: string, url = URL) =>
  app.inject({ method: "PUT", url, headers: headers(t), payload: { input: { value, updatedAt } } });

describe("/api/me/preferences (UX-27)", () => {
  it("needs a session", async () => {
    expect((await app.inject({ method: "GET", url: URL })).statusCode).toBe(401);
  });

  it("is empty until written, then returns what was written", async () => {
    const t = await token("a@pharos.dev");
    expect((await get(t)).json()).toEqual({ key: "home.board", value: null, updatedAt: null });
    const board = { version: 1, items: [{ id: "daily", x: 0, y: 0, w: 8, h: 6 }], hidden: [] };
    const res = await put(t, board, "2026-11-09T10:00:00.000Z");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ key: "home.board", value: board, updatedAt: "2026-11-09T10:00:00.000Z" });
    expect((await get(t)).json().value).toEqual(board);
  });

  it("keeps each account's own value", async () => {
    const a = await token("a@pharos.dev");
    const b = await token("b@pharos.dev");
    await put(a, { version: 1, mine: "a" }, "2026-11-09T10:00:00.000Z");
    await put(b, { version: 1, mine: "b" }, "2026-11-09T10:00:00.000Z");
    expect((await get(a)).json().value).toEqual({ version: 1, mine: "a" });
    expect((await get(b)).json().value).toEqual({ version: 1, mine: "b" });
  });

  it("the newest change wins, whatever order they arrive in", async () => {
    const t = await token("a@pharos.dev");
    await put(t, { n: 2 }, "2026-11-09T12:00:00.000Z");
    // An older change sent later (made offline) does not replace it…
    const late = await put(t, { n: 1 }, "2026-11-09T11:00:00.000Z");
    expect(late.json()).toMatchObject({ value: { n: 2 }, updatedAt: "2026-11-09T12:00:00.000Z" });
    // …a newer one does.
    await put(t, { n: 3 }, "2026-11-09T13:00:00.000Z");
    expect((await get(t)).json().value).toEqual({ n: 3 });
  });

  it("dates a change from a clock in the future no later than now + 5 min", async () => {
    const t = await token("a@pharos.dev");
    const res = await put(t, { n: 1 }, "2099-01-01T00:00:00.000Z");
    expect(Date.parse(res.json().updatedAt)).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000 + 1000);
  });

  it("refuses unknown keys, missing dates and values too large", async () => {
    const t = await token("a@pharos.dev");
    expect((await get(t, "/api/me/preferences/theme")).statusCode).toBe(400);
    expect((await put(t, { n: 1 }, "ayer")).statusCode).toBe(400);
    const big = "x".repeat(MAX_VALUE_BYTES);
    expect((await put(t, { big }, "2026-11-09T10:00:00.000Z")).statusCode).toBe(400);
    expect((await get(t)).json().value).toBeNull();
  });
});
