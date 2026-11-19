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

// Findings and metrics over sync (ING-06, ADR-0053): append-only documents
// behind the `findings` feature, checked like the desktop stores them.

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

const BEFORE =
  "key-conflicts,append-only,complete-payload,stable-steps,runs,custom-fields,cycles,defects,requirement-data,workspaces,case-baselines,blobs";
const ALL = `${BEFORE},findings`;

async function tokenFor(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email: "f@pharos.dev",
      password: "supersecret1",
      displayName: "F",
      firstName: "Fa",
      lastName: "Ro",
    },
  });
  return res.json().accessToken as string;
}

const headers = (token: string, features: string) => ({
  authorization: `Bearer ${token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: features,
});

async function projectOf(token: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: headers(token, "key-conflicts,stable-steps"),
    payload: { name: "Tienda" },
  });
  return res.json().id as string;
}

const finding = (projectId: string, over: Record<string, unknown> = {}) => ({
  entity: "finding",
  entityId: "f1",
  op: "append",
  payload: {
    id: "f1",
    projectId,
    runId: "r1",
    shardId: "s1",
    ruleId: "image-alt",
    severity: "critical",
    message: "Images must have alternate text",
    fingerprint: "pharos:eeae370c-678f-555d-adc4-65070e88eac6",
    location: { url: "http://localhost:3000/", selector: "img" },
    standardRefs: ["WCAG2:1.1.1"],
    attributes: { tool: "axe-core" },
    createdAt: "2026-11-18T22:00:00.000Z",
    createdBy: "u1",
    hlc: "0000000000001-0000-dev",
    ...over,
  },
  revision: 1,
  author: "x",
  hlc: "0000000000001-0000-dev",
});

const metric = (projectId: string) => ({
  entity: "metric",
  entityId: "m1",
  op: "append",
  payload: {
    id: "m1",
    projectId,
    runId: "r1",
    shardId: "s1",
    name: "http_req_failed",
    aggregation: "rate",
    value: 0.5,
    unit: "ratio",
    threshold: "rate<0.0001",
    passed: false,
  },
  revision: 1,
  author: "x",
  hlc: "0000000000002-0000-dev",
});

async function push(token: string, features: string, deltas: unknown[]) {
  return app.inject({
    method: "POST",
    url: "/sync/push",
    headers: headers(token, features),
    payload: { deltas },
  });
}

async function pulled(token: string, features: string) {
  const res = await app.inject({
    method: "GET",
    url: "/sync/pull?since=0",
    headers: headers(token, features),
  });
  return (
    res.json().docs as { entity: string; payload: Record<string, unknown> }[]
  ).filter((d) => ["finding", "metric"].includes(d.entity));
}

describe("findings and metrics over sync (ING-06)", () => {
  it("the server lists the findings feature", () => {
    expect(SERVER_FEATURES).toContain("findings");
  });

  it("a client without the feature may not push them", async () => {
    const token = await tokenFor();
    const p = await projectOf(token);
    const res = await push(token, BEFORE, [finding(p)]);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("findings_unsupported");
  });

  it("only clients that announce findings pull them", async () => {
    const token = await tokenFor();
    const p = await projectOf(token);
    const res = await push(token, ALL, [finding(p), metric(p)]);
    expect(res.statusCode).toBe(200);
    expect(await pulled(token, BEFORE)).toHaveLength(0);
    const docs = await pulled(token, ALL);
    expect(docs.map((d) => d.entity).sort()).toEqual(["finding", "metric"]);
    expect(docs.find((d) => d.entity === "metric")!.payload).toMatchObject({
      passed: false,
      value: 0.5,
    });
  });

  it("the same finding again is a no-op, whoever wrote it and when", async () => {
    const token = await tokenFor();
    const p = await projectOf(token);
    expect((await push(token, ALL, [finding(p)])).statusCode).toBe(200);
    const again = await push(token, ALL, [
      finding(p, {
        createdAt: "2026-11-19T10:00:00.000Z",
        createdBy: "u2",
        hlc: "0000000000009-0000-dev",
      }),
    ]);
    expect(again.statusCode).toBe(200);
    expect(again.json().appendRejected).toEqual([]);
    expect(await pulled(token, ALL)).toHaveLength(1);
  });

  it("refuses a finding without what the desktop needs to store it", async () => {
    const token = await tokenFor();
    const p = await projectOf(token);
    const res = await push(token, ALL, [finding(p, { severity: "urgent" })]);
    expect(res.statusCode).toBe(400);
    const res2 = await push(token, ALL, [finding(p, { fingerprint: "" })]);
    expect(res2.statusCode).toBe(400);
  });
});
