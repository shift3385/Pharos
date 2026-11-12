import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import {
  FEATURES_HEADER,
  SERVER_VERSION,
  VERSION_HEADER,
} from "../src/modules/sync/sync.version";

// TRZ-04: the web keeps the project's risk bands in its document; the
// execution summary reads them (its bands, the band of each requirement and
// the coverage weighted by risk).

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
  await pool.query("TRUNCATE key_blocks");
});

async function register(
  email: string,
): Promise<{ token: string; userId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email,
      password: "supersecret1",
      displayName: "W",
      firstName: "A",
      lastName: "B",
    },
  });
  const body = res.json();
  return { token: body.accessToken as string, userId: body.user.id as string };
}

type Method = "GET" | "POST" | "PUT";
async function call(
  token: string,
  method: Method,
  url: string,
  payload?: unknown,
) {
  const res = await app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${token}`,
      [VERSION_HEADER]: SERVER_VERSION,
      [FEATURES_HEADER]: "key-conflicts",
    },
    payload: payload as object,
  });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}


describe("risk bands per project on the web (TRZ-04)", () => {
  it("defaults to 4 and 12, keeps them when not sent and refuses a bad pair", async () => {
    const { token } = await register("bands@pharos.dev");
    const p = (await call(token, "POST", "/api/projects", { name: "Risk" })).body;
    expect([p.riskBandLow, p.riskBandMedium]).toEqual([4, 12]);
    const six = await call(token, "PUT", `/api/projects/${p.id}`, {
      input: { name: "Risk", riskBandLow: 6, riskBandMedium: 14 },
      revision: p.revision,
    });
    expect(six.status).toBe(200);
    const renamed = await call(token, "PUT", `/api/projects/${p.id}`, {
      input: { name: "Risk 2" },
      revision: six.body.revision,
    });
    expect([renamed.body.riskBandLow, renamed.body.riskBandMedium]).toEqual([6, 14]);
    const list = (await call(token, "GET", "/api/projects")).body as { id: string; riskBandLow: number }[];
    expect(list.find((x) => x.id === p.id)?.riskBandLow).toBe(6);
    for (const input of [
      { name: "Risk", riskBandLow: 14, riskBandMedium: 6 },
      { name: "Risk", riskBandLow: 0, riskBandMedium: 6 },
      { name: "Risk", riskBandLow: 4, riskBandMedium: 25 },
      { name: "Risk", riskBandLow: 4 },
    ]) {
      const bad = await call(token, "PUT", `/api/projects/${p.id}`, { input, revision: renamed.body.revision });
      expect(bad.status, JSON.stringify(input)).toBe(400);
    }
  });

  it("the execution summary uses the project's bands and weighs coverage by risk", async () => {
    const { token } = await register("weighted@pharos.dev");
    const p = (await call(token, "POST", "/api/projects", { name: "W", riskBandLow: 9, riskBandMedium: 11 })).body;
    for (const [key, l, i] of [
      ["REQ-1", 3, 3],
      ["REQ-2", 3, 4],
      ["REQ-3", null, null],
    ] as const) {
      const r = await call(token, "POST", "/api/requirements", {
        projectId: p.id,
        requirementKey: key,
        title: key,
        priority: "medium",
        riskLikelihood: l,
        riskImpact: i,
      });
      expect(r.status, key).toBe(200);
    }
    const s = (await call(token, "GET", `/api/execution/summary?projectId=${p.id}`)).body;
    expect(s.coverage.riskBands).toEqual({ low: 9, medium: 11 });
    expect(s.requirements.map((r: { riskBand: string }) => r.riskBand)).toEqual(["low", "high", "unassessed"]);
    expect(s.coverage.weighted).toEqual({
      totalWeight: 21,
      coveredWeight: 0,
      passedWeight: 0,
      coverageRatio: 0,
      passedRatio: 0,
      unassessed: 1,
    });
  });
});
