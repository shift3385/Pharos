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

const triage = (
  projectId: string,
  id: string,
  state: string,
  reason: string | null,
  hlc: string,
) => ({
  entity: "finding_triage",
  entityId: id,
  op: "append",
  payload: {
    id,
    projectId,
    fingerprint: "pharos:eeae370c-678f-555d-adc4-65070e88eac6",
    state,
    reason,
    hlc,
    createdBy: "u1",
    createdAt: "2026-11-19T10:00:00.000Z",
  },
  revision: 1,
  author: "x",
  hlc,
});

describe("finding triage over sync (ADR-0053 as amended: append-only events)", () => {
  it("keeps every decision as its own document, behind the findings feature", async () => {
    const token = await tokenFor();
    const p = await projectOf(token);
    expect(
      (
        await push(token, BEFORE, [
          triage(p, "t1", "open", null, "0000000000001-0000-a"),
        ])
      ).json().code,
    ).toBe("findings_unsupported");
    const res = await push(token, ALL, [
      triage(
        p,
        "t1",
        "false_positive",
        "Validado en el esquema",
        "0000000000001-0000-a",
      ),
      triage(p, "t2", "open", null, "0000000000002-0000-b"),
    ]);
    expect(res.statusCode).toBe(200);
    const res2 = await app.inject({
      method: "GET",
      url: "/sync/pull?since=0",
      headers: headers(token, ALL),
    });
    const docs = (
      res2.json().docs as { entity: string; entityId: string }[]
    ).filter((d) => d.entity === "finding_triage");
    expect(docs.map((d) => d.entityId).sort()).toEqual(["t1", "t2"]);
  });

  it("refuses a decision without its reason, or with an unknown state", async () => {
    const token = await tokenFor();
    const p = await projectOf(token);
    expect(
      (
        await push(token, ALL, [
          triage(p, "t1", "accepted_risk", null, "0000000000001-0000-a"),
        ])
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await push(token, ALL, [
          triage(p, "t1", "ignored", "x", "0000000000001-0000-a"),
        ])
      ).statusCode,
    ).toBe(400);
  });
});

describe("findings, metrics and triage on the web (F4)", () => {
  async function web(
    token: string,
    method: "GET" | "POST",
    url: string,
    payload?: unknown,
  ) {
    const res = await app.inject({
      method,
      url,
      headers: headers(token, "key-conflicts,stable-steps"),
      payload: payload as object,
    });
    return { status: res.statusCode, body: res.body ? res.json() : undefined };
  }
  async function newRun(
    token: string,
    projectId: string,
    title: string,
    startedAt: string,
  ) {
    const res = await web(token, "POST", "/api/runs", {
      input: { projectId, title, sourceTool: "axe-core", startedAt },
    });
    expect(res.status).toBe(200);
    return res.body.id as string;
  }
  const findingOf = (
    projectId: string,
    runId: string,
    id: string,
    fingerprint: string,
    severity: string,
  ) => ({
    ...finding(projectId, { id, runId, fingerprint, severity }),
    entityId: id,
  });

  it("lists a run's findings worst first, with triage and what is new since the previous run", async () => {
    const token = await tokenFor();
    const p = await projectOf(token);
    const r1 = await newRun(token, p, "Antes", "2026-11-18T10:00:00.000Z");
    const r2 = await newRun(token, p, "Ahora", "2026-11-19T10:00:00.000Z");
    expect(
      (
        await push(token, ALL, [
          findingOf(p, r1, "a1", "fp-old", "high"),
          findingOf(p, r2, "b1", "fp-old", "high"),
          findingOf(p, r2, "b2", "fp-new", "critical"),
          { ...metric(p), payload: { ...metric(p).payload, runId: r2 } },
        ])
      ).statusCode,
    ).toBe(200);
    const one = (await web(token, "GET", `/api/runs/${r1}/findings`)).body as {
      isNew: boolean;
    }[];
    expect(one.map((f) => f.isNew)).toEqual([false]);
    const two = (await web(token, "GET", `/api/runs/${r2}/findings`)).body as {
      fingerprint: string;
      severity: string;
      isNew: boolean;
      triage: unknown;
    }[];
    expect(two.map((f) => [f.fingerprint, f.severity, f.isNew])).toEqual([
      ["fp-new", "critical", true],
      ["fp-old", "high", false],
    ]);
    const metrics = (await web(token, "GET", `/api/runs/${r2}/metrics`))
      .body as { passed: boolean }[];
    expect(metrics.map((m) => m.passed)).toEqual([false]);

    const set = await web(token, "POST", "/api/finding-triage", {
      projectId: p,
      fingerprint: "fp-old",
      state: "accepted_risk",
      reason: "Diseño aprobado",
    });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({
      state: "accepted_risk",
      reason: "Diseño aprobado",
      createdBy: expect.any(String),
    });
    for (const run of [r1, r2]) {
      const fs = (await web(token, "GET", `/api/runs/${run}/findings`))
        .body as { fingerprint: string; triage: { state: string } | null }[];
      expect(fs.find((f) => f.fingerprint === "fp-old")!.triage?.state).toBe(
        "accepted_risk",
      );
    }
    await web(token, "POST", "/api/finding-triage", {
      projectId: p,
      fingerprint: "fp-old",
      state: "open",
    });
    const history = (
      await web(
        token,
        "GET",
        `/api/finding-triage?projectId=${p}&fingerprint=fp-old`,
      )
    ).body as { state: string }[];
    expect(history.map((h) => h.state)).toEqual(["open", "accepted_risk"]);
    // The web's decisions reach the desktops through sync.
    expect((await pulled(token, ALL)).length).toBeGreaterThan(0);
  });

  it("refuses a decision without its reason", async () => {
    const token = await tokenFor();
    const p = await projectOf(token);
    const res = await web(token, "POST", "/api/finding-triage", {
      projectId: p,
      fingerprint: "fp",
      state: "fixed",
    });
    expect(res.status).toBe(400);
  });
});

describe("a linked threshold in the web's matrix (F5)", () => {
  it("fails its case; an unlinked one changes nothing", async () => {
    const token = await tokenFor();
    const p = await projectOf(token);
    const web = async (
      method: "GET" | "POST",
      url: string,
      payload?: unknown,
    ) => {
      const res = await app.inject({
        method,
        url,
        headers: headers(token, "key-conflicts,stable-steps"),
        payload: payload as object,
      });
      return res.json();
    };
    const pay = await web("POST", "/api/test-cases", {
      projectId: p,
      title: "Pago",
      data: { steps: ["pagar"] },
    });
    const key = pay.scenarioId as string;
    const run = await web("POST", "/api/runs", {
      input: {
        projectId: p,
        title: "k6",
        sourceTool: "k6",
        startedAt: "2026-11-10T09:00:00.000Z",
      },
    });
    const m = (
      id: string,
      passed: boolean,
      attributes: Record<string, unknown>,
    ) => ({
      ...metric(p),
      entityId: id,
      payload: { ...metric(p).payload, id, runId: run.id, passed, attributes },
    });
    expect(
      (
        await push(token, ALL, [
          m("m-linked", false, { tags: [`@${key}`] }),
          m("m-other", false, {}),
        ])
      ).statusCode,
    ).toBe(200);
    const s = await web("GET", `/api/execution/summary?projectId=${p}`);
    const row = (s.cases as { caseId: string; status: string }[]).find(
      (c) => c.caseId === pay.id,
    )!;
    expect(row.status).toBe("failed");
  });
});
