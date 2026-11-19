// Uploading reports through /api/v1 (INT-02 A2, ADR-0052 §2): the run it goes
// to, idempotency, a CI matrix on one run, closing, links derived as on the
// desktop, what a device pulls, and every refusal (security review: size,
// gzip, DTD, format, scope, role, errors that never echo the file).
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { inProcessParser } from "../src/modules/api/reportParse";

let app: FastifyInstance;
let pool: Pool;
let logs = "";

beforeAll(async () => {
  ({ app, pool } = await setupTestApp({}, { reportParser: inProcessParser, logStream: { write: (l: string) => void (logs += l) } }));
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  logs = "";
});

interface Account {
  token: string;
  userId: string;
}

async function register(email: string): Promise<Account> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: email.split("@")[0], firstName: "F", lastName: "L" },
  });
  return { token: res.json().accessToken, userId: res.json().user.id };
}
const session = (a: Account) => ({
  authorization: `Bearer ${a.token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: SERVER_FEATURES.join(","),
});
const call = (a: Account, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as "GET", url, headers: session(a), payload: payload as object });

const H = (n: number) => `${String(n).padStart(15, "0")}-00000-dev`;
const delta = (entity: string, id: string, payload: object) => ({
  entity,
  entityId: id,
  op: "upsert",
  revision: 1,
  author: "A",
  hlc: H(1),
  payload: { id, workspaceId: "whatever", ...payload },
});

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

/** Ana (Test Manager) and Marta (Viewer) in «QA Pagos», project p1 (prefix
 *  PAY-) with case PAY-001; a CI token of Ana for p1. */
async function setup(scopes = ["projects:read", "runs:read", "runs:write"]) {
  const ana = await register("ana@pharos.dev");
  const marta = await register("marta@pharos.dev");
  const ws = (await call(ana, "POST", "/workspaces", { name: "QA Pagos" })).json().id as string;
  const inv = await call(ana, "POST", `/workspaces/${ws}/invitations`, { role: "viewer" });
  await call(marta, "POST", "/invitations/accept", { code: inv.json().code });
  const pushed = await call(ana, "POST", "/sync/push", {
    workspaceId: ws,
    deltas: [
      delta("project", "p1", { name: "Pagos Web", caseIdPrefix: "PAY-" }),
      delta("test_case", "c1", { projectId: "p1", scenarioId: "PAY-001", title: "Pagar con tarjeta" }),
    ],
  });
  expect(pushed.json().accepted).toBe(2);
  const tok = await call(ana, "POST", `/workspaces/${ws}/tokens`, { name: "CI", projectId: "p1", scopes, expiresAt: inDays(30) });
  expect(tok.statusCode).toBe(201);
  return { ana, marta, ws, token: tok.json().token as string };
}

/** JUnit carries no tags in names: a case tag is a `tag` property (ING-01). */
const junit = (suite: string, cases: { name: string; tag?: string; failure?: string }[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<testsuites><testsuite name="${suite}" tests="${cases.length}">${cases
    .map(
      (c) =>
        `<testcase classname="${suite}" name="${c.name}" time="0.5">${c.tag ? `<properties><property name="tag" value="${c.tag}"/></properties>` : ""}${c.failure ? `<failure message="${c.failure}">trace</failure>` : ""}</testcase>`,
    )
    .join("")}</testsuite></testsuites>`;

const FILE_A = junit("pagos", [{ name: "paga con tarjeta", tag: "@PAY-001" }, { name: "rechaza una tarjeta caducada", failure: "expected 402" }]);
const FILE_B = junit("pagos-movil", [{ name: "paga desde el móvil", tag: "@PAY-001" }]);

function upload(token: string, body: string | Buffer, query = "", headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: `/api/v1/projects/p1/results${query ? `?${query}` : ""}`,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/xml", ...headers },
    payload: body,
  });
}

describe("uploading a report", () => {
  it("creates a run, stores shard, results and the raw report, and links by tag as the desktop does", async () => {
    const { token, ws } = await setup();
    const res = await upload(token, FILE_A, "fileName=junit.xml");
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      run: { key: "RUN-001", status: "completed" },
      shard: { created: true, format: "junit" },
      counts: { results: 2, linked: 1, unlinked: 1, byStatus: { passed: 1, failed: 1 }, findings: 0, metrics: 0 },
    });
    const docs = (await pool.query("SELECT entity, payload FROM documents WHERE workspace_id = $1 AND entity <> 'audit_event'", [ws])).rows;
    const of = (e: string) => docs.filter((d) => d.entity === e).map((d) => d.payload);
    expect(of("run_shard")).toHaveLength(1);
    expect(of("run_shard")[0]).toMatchObject({ sourceFormat: "junit", runId: body.run.id, normalizerVersion: 1 });
    const results = of("result");
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r).toMatchObject({ shardId: body.shard.id, testCaseId: null, runItemId: null, executedBy: "tool:junit" });
    }
    expect(of("attachment")).toEqual([expect.objectContaining({ kind: "raw_report", ownerEntity: "run_shard", name: "junit.xml" })]);
    const blob = await pool.query("SELECT size FROM blobs WHERE workspace_id = $1", [ws]);
    expect(Number(blob.rows[0].size)).toBe(Buffer.byteLength(FILE_A));
  });

  it("imports a TRX (ING-07): a [TestCategory] links like a tag", async () => {
    const { token, ws } = await setup();
    const trx = `<?xml version="1.0" encoding="utf-8"?>
<TestRun id="r" name="ci" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">
  <Times start="2026-11-19T10:00:00Z" finish="2026-11-19T10:01:00Z" />
  <Results>
    <UnitTestResult testId="t1" testName="Pays" outcome="Passed" startTime="2026-11-19T10:00:01Z" duration="00:00:00.25" />
    <UnitTestResult testId="t2" testName="Refunds" outcome="Failed" startTime="2026-11-19T10:00:02Z" />
  </Results>
  <TestDefinitions>
    <UnitTest id="t1" name="Pays"><TestCategory><TestCategoryItem TestCategory="PAY-001" /></TestCategory>
      <TestMethod className="Shop.PayTests" name="Pays" adapterTypeName="executor://mstestadapter/v2" /></UnitTest>
    <UnitTest id="t2" name="Refunds"><TestMethod className="Shop.PayTests" name="Refunds" adapterTypeName="executor://mstestadapter/v2" /></UnitTest>
  </TestDefinitions>
</TestRun>`;
    const res = await upload(token, trx, "format=trx&fileName=results.trx");
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      shard: { created: true, format: "trx" },
      counts: { results: 2, linked: 1, unlinked: 1, byStatus: { passed: 1, failed: 1 } },
    });
    const shard = (await pool.query("SELECT payload FROM documents WHERE workspace_id = $1 AND entity = 'run_shard'", [ws])).rows[0];
    expect(shard.payload).toMatchObject({ sourceFormat: "trx" });
  });

  it("the same file again is a no-op that answers the same run", async () => {
    const { token } = await setup();
    const first = (await upload(token, FILE_A)).json();
    const again = await upload(token, FILE_A);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ run: { id: first.run.id }, shard: { id: first.shard.id, created: false } });
    expect((await pool.query("SELECT count(*) AS n FROM documents WHERE entity = 'result'")).rows[0].n).toBe("2");
  });

  it("a CI matrix converges on one run by externalId, which stays open until closed", async () => {
    const { token } = await setup();
    const q = "externalId=github%3Aacme%2Fpagos%3A42%3A1&runName=PR%20%2342";
    const a = (await upload(token, FILE_A, q)).json();
    const b = (await upload(token, FILE_B, q)).json();
    expect(b.run.id).toBe(a.run.id);
    expect(b.run.status).toBe("in_progress");
    expect(b.shard.id).not.toBe(a.shard.id);
    const summary = await app.inject({ method: "GET", url: `/api/v1/projects/p1/runs/${a.run.key}`, headers: { authorization: `Bearer ${token}` } });
    expect(summary.json()).toMatchObject({ run: { title: "PR #42" }, counts: { results: 3, linked: 2 } });
    const closed = await app.inject({
      method: "POST",
      url: `/api/v1/projects/p1/runs/${a.run.key}/close`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().run.status).toBe("completed");
    const late = await upload(token, junit("tarde", [{ name: "llega tarde" }]), q);
    expect(late.statusCode).toBe(409);
    expect(late.json().code).toBe("run_closed");
  });

  it("creates an empty run for a matrix once, and uploads into it by runKey", async () => {
    const { token } = await setup();
    const auth = { authorization: `Bearer ${token}` };
    const made = await app.inject({ method: "POST", url: "/api/v1/projects/PAY/runs", headers: auth, payload: { externalId: "gh:7", name: "Nightly" } });
    expect(made.statusCode).toBe(201);
    const again = await app.inject({ method: "POST", url: "/api/v1/projects/PAY/runs", headers: auth, payload: { externalId: "gh:7" } });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(made.json().id);
    const up = await upload(token, FILE_A, `runKey=${made.json().runKey}`);
    expect(up.json().run).toMatchObject({ id: made.json().id, status: "in_progress" });
    expect((await upload(token, FILE_A, "runKey=RUN-999")).json().code).toBe("run_not_found");
    const list = await app.inject({ method: "GET", url: "/api/v1/projects/p1/runs", headers: auth });
    expect(list.json().runs.map((r: { runKey: string }) => r.runKey)).toEqual([made.json().runKey]);
    const results = await app.inject({ method: "GET", url: `/api/v1/projects/p1/runs/${made.json().runKey}/results`, headers: auth });
    expect(results.json().results).toHaveLength(2);
    expect(results.json().results.find((r: { testCaseId: string | null }) => r.testCaseId)).toMatchObject({ testCaseId: "c1" });
  });

  it("takes Pharos Run JSON, gzip, and links a whole file to a case with caseKey", async () => {
    const { token } = await setup();
    const doc = {
      schemaVersion: "1.0.0",
      run: { title: "k6 nocturno", sourceTool: "custom" },
      results: [{ name: "carga 50 usuarios", status: "passed", testKey: "load/50" }],
    };
    const res = await upload(token, gzipSync(JSON.stringify(doc)), "caseKey=PAY-001", {
      "content-type": "application/json",
      "content-encoding": "gzip",
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ shard: { format: "pharos_run_json" }, counts: { results: 1, linked: 1 } });
    const r = (await pool.query("SELECT payload FROM documents WHERE entity = 'result'")).rows[0].payload;
    expect(r).toMatchObject({ caseKey: "PAY-001", executedBy: "tool:custom", testCaseId: null });
  });

  it("a device pulls exactly the documents the upload wrote", async () => {
    const { ana, ws, token } = await setup();
    await upload(token, FILE_A);
    const pull = await app.inject({ method: "GET", url: `/sync/pull?since=0&workspace=${ws}`, headers: session(ana) });
    const entities = pull.json().docs.map((c: { entity: string }) => c.entity);
    for (const e of ["run", "run_shard", "result", "attachment"]) expect(entities).toContain(e);
  });

  it("audits the import with the token it came through", async () => {
    const { token } = await setup();
    await upload(token, FILE_A);
    const ev = (await pool.query(`SELECT payload FROM documents WHERE entity = 'audit_event' AND payload->>'action' = 'import'`)).rows;
    expect(ev).toHaveLength(1);
    const summary = typeof ev[0].payload.summary === "string" ? JSON.parse(ev[0].payload.summary) : ev[0].payload.summary;
    expect(summary).toMatchObject({ format: "junit", results: 2, via: { kind: "token", name: "CI" } });
  });
});

describe("refusals", () => {
  it("checks the format it was told against the one it found; allure is not there yet", async () => {
    const { token } = await setup();
    const res = await upload(token, FILE_A, "format=ctrf");
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "format_mismatch", expected: "ctrf", detected: "junit" });
    expect((await upload(token, FILE_A, "format=junit")).statusCode).toBe(201);
    expect((await upload(token, FILE_A, "format=allure")).json()).toMatchObject({ code: "unsupported_format", format: "allure" });
    expect((await upload(token, FILE_A, "format=nope")).statusCode).toBe(400);
  });

  it("refuses a DTD (XXE) and never echoes the file in the answer or the log", async () => {
    const { token } = await setup();
    const evil = `<?xml version="1.0"?><!DOCTYPE t [<!ENTITY x SYSTEM "file:///etc/passwd">]><testsuites><testsuite name="SECRET-MARKER"/></testsuites>`;
    const res = await upload(token, evil);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "invalid_report", reason: "doctype" });
    expect(res.body).not.toContain("SECRET-MARKER");
    expect(logs).not.toContain("SECRET-MARKER");
    const bad = await upload(token, "{ not json SECRET-MARKER", "", { "content-type": "application/json" });
    expect(bad.statusCode).toBe(422);
    expect(bad.body).not.toContain("SECRET-MARKER");
  });

  it("limits the body and the decompressed report (gzip bomb)", async () => {
    const { token } = await setup();
    const big = Buffer.alloc(2 * 1024 * 1024, 32);
    expect((await upload(token, big)).statusCode).toBe(413);
    const bomb = gzipSync(Buffer.alloc(8 * 1024 * 1024, 32));
    expect(bomb.length).toBeLessThan(1024 * 1024);
    const res = await upload(token, bomb, "", { "content-encoding": "gzip" });
    expect(res.statusCode).toBe(413);
    expect((await upload(token, Buffer.from("x"), "", { "content-encoding": "br" })).statusCode).toBe(415);
    expect((await upload(token, "")).statusCode).toBe(400);
  });

  it("needs runs:write, a project in the token's reach and an owner who may import", async () => {
    const { token, ana, ws, marta } = await setup(["projects:read", "runs:read"]);
    const res = await upload(token, FILE_A);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: "insufficient_scope", scope: "runs:write" });
    // A Viewer's personal token: the role cannot import.
    const pat = (await call(marta, "POST", "/me/tokens", { name: "x", workspaceId: ws, scopes: ["runs:write"], expiresAt: inDays(5) })).json().token;
    const viewer = await upload(pat, FILE_A);
    expect(viewer.statusCode).toBe(403);
    expect(viewer.json().code).toBe("forbidden");
    // Another project of another workspace: as if it did not exist.
    await call(ana, "POST", "/sync/push", { deltas: [delta("project", "p9", { name: "Mío", caseIdPrefix: "MIO-" })] });
    const other = await app.inject({
      method: "POST",
      url: "/api/v1/projects/p9/results",
      headers: { authorization: `Bearer ${pat}`, "content-type": "application/xml" },
      payload: FILE_A,
    });
    expect(other.statusCode).toBe(404);
  });

  it("refuses runKey with externalId, and unknown query parameters", async () => {
    const { token } = await setup();
    expect((await upload(token, FILE_A, "runKey=RUN-001&externalId=x")).statusCode).toBe(400);
    expect((await upload(token, FILE_A, "token=abc")).json().code).toBe("token_in_url");
    expect((await upload(token, FILE_A, "colour=blue")).statusCode).toBe(400);
  });
});

// ---- findings and metrics (A2b, ADR-0053) -------------------------------------

const sample = (path: string) =>
  readFileSync(new URL(`../../packages/formats/src/fixtures/${path}`, import.meta.url), "utf8");

describe("findings and metrics", () => {
  it("stores SARIF findings, k6 metrics and axe findings as the desktop does", async () => {
    const { token, ws } = await setup();
    const sarif = await upload(token, sample("sarif/trivy-misconfig.sarif"), "format=sarif&externalId=pr-7", {
      "content-type": "application/json",
    });
    expect(sarif.statusCode).toBe(201);
    const body = sarif.json();
    expect(body.counts.findings).toBeGreaterThan(0);
    expect(body.counts.results).toBe(0);
    const k6 = await upload(token, sample("k6/summary-export.json"), "format=k6&externalId=pr-7", { "content-type": "application/json" });
    expect(k6.json().counts.metrics).toBeGreaterThan(0);
    const axe = await upload(token, sample("axe/checkout-broken.json"), "format=axe&externalId=pr-7", { "content-type": "application/json" });
    expect(axe.json().counts.findings).toBeGreaterThan(0);
    expect(new Set([body.run.id, k6.json().run.id, axe.json().run.id]).size).toBe(1);

    const docs = (await pool.query("SELECT entity, payload FROM documents WHERE workspace_id = $1", [ws])).rows;
    const findings = docs.filter((d) => d.entity === "finding").map((d) => d.payload);
    const metrics = docs.filter((d) => d.entity === "metric").map((d) => d.payload);
    expect(findings).toHaveLength(body.counts.findings + k6.json().counts.findings + axe.json().counts.findings);
    expect(metrics).toHaveLength(body.counts.metrics + k6.json().counts.metrics + axe.json().counts.metrics);
    expect(findings[0]).toMatchObject({ runId: body.run.id, createdBy: expect.any(String) });
    expect(["critical", "high", "medium", "low", "info"]).toContain(findings[0].severity);
    expect(typeof metrics[0].value).toBe("number");
    const ev = (await pool.query(`SELECT payload FROM documents WHERE entity = 'audit_event' AND payload->>'action' = 'import'`)).rows.map((r) =>
      typeof r.payload.summary === "string" ? JSON.parse(r.payload.summary) : r.payload.summary,
    );
    expect(ev.find((s) => s.format === "sarif")).toMatchObject({ findings: body.counts.findings, findingSeverities: expect.any(Object) });
  });

  it("the same SARIF again stores nothing new", async () => {
    const { token } = await setup();
    const file = sample("sarif/eslint.sarif");
    const first = await upload(token, file, "", { "content-type": "application/json" });
    const again = await upload(token, file, "", { "content-type": "application/json" });
    expect(again.statusCode).toBe(200);
    expect(again.json().shard.id).toBe(first.json().shard.id);
    const n = (await pool.query("SELECT count(*) AS n FROM documents WHERE entity = 'finding'")).rows[0].n;
    expect(Number(n)).toBe(first.json().counts.findings);
  });

  it("refuses a metric without a value, writing nothing", async () => {
    const { token } = await setup();
    const doc = {
      schemaVersion: "1.0.0",
      results: [],
      metrics: [{ name: "http_req_duration", aggregation: "p(95)" }],
    };
    const res = await upload(token, JSON.stringify(doc), "", { "content-type": "application/json" });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "invalid_report" });
    expect((await pool.query("SELECT count(*) AS n FROM documents WHERE entity IN ('run_shard', 'metric')")).rows[0].n).toBe("0");
  });
});
