// Outgoing webhooks (INT-03, ADR-0052 §4): who manages them, the events every
// writer produces (web, API, desktop push), signing and rotation, retries,
// abandon and auto-disable, the SSRF guard, and one real delivery.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { verify } from "../src/modules/webhooks/signing";
import { checkUrl, isPrivateAddress } from "../src/modules/webhooks/ssrf";
import { DISABLE_AFTER_FAILURES, httpSender, MAX_ATTEMPTS, type SendResult } from "../src/modules/webhooks/dispatcher";
import { inProcessParser } from "../src/modules/api/reportParse";

interface Sent {
  url: string;
  body: string;
  headers: Record<string, string>;
}
let sent: Sent[] = [];
let answer: SendResult = { ok: true, status: 200, error: null, durationMs: 3, response: "ok" };

let app: FastifyInstance;
let pool: Pool;
let logs = "";

beforeAll(async () => {
  ({ app, pool } = await setupTestApp(
    {},
    {
      reportParser: inProcessParser,
      logStream: { write: (l: string) => void (logs += l) },
      webhookSender: async (url, body, headers) => {
        sent.push({ url, body, headers });
        return answer;
      },
    },
  ));
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  sent = [];
  logs = "";
  answer = { ok: true, status: 200, error: null, durationMs: 3, response: "ok" };
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
const delta = (entity: string, id: string, payload: object, revision = 1, hlc = H(1)) => ({
  entity,
  entityId: id,
  op: "upsert",
  revision,
  author: "A",
  hlc,
  payload: { id, workspaceId: "whatever", ...payload },
});
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const DEFECT = { projectId: "p1", defectKey: "DEF-001", title: "Pago doble", severity: "major", priority: "high" };
const ALL = ["run.created", "run.results_uploaded", "run.completed", "cycle.closed", "defect.created", "defect.status_changed", "review.decided"];

async function team() {
  const ana = await register("ana@pharos.dev");
  const luis = await register("luis@pharos.dev");
  const ws = (await call(ana, "POST", "/workspaces", { name: "QA Pagos" })).json().id as string;
  const inv = await call(ana, "POST", `/workspaces/${ws}/invitations`, { role: "automation_engineer" });
  await call(luis, "POST", "/invitations/accept", { code: inv.json().code });
  await call(ana, "POST", "/sync/push", {
    workspaceId: ws,
    deltas: [delta("project", "p1", { name: "Pagos Web", caseIdPrefix: "PAY-" }), delta("project", "p2", { name: "API", caseIdPrefix: "API-" })],
  });
  return { ana, luis, ws };
}

async function hook(a: Account, ws: string, over: object = {}) {
  const res = await call(a, "POST", `/workspaces/${ws}/webhooks`, {
    name: "Bot de PRs",
    url: "https://hooks.example.com/pharos",
    events: ALL,
    ...over,
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { secret: string; view: { id: string } };
}

const deliveries = async () =>
  (await pool.query("SELECT event_type, status, attempt, payload FROM webhook_deliveries ORDER BY created_at, event_type")).rows;

describe("managing webhooks", () => {
  it("a Test Manager creates one; the secret is shown once and stored encrypted", async () => {
    const { ana, luis, ws } = await team();
    const { secret, view } = await hook(ana, ws);
    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/]+=*$/);
    const stored = await pool.query("SELECT * FROM webhooks");
    expect(JSON.stringify(stored.rows)).not.toContain(secret.slice(6));
    const mine = (await call(ana, "GET", `/workspaces/${ws}/webhooks`)).json();
    expect(mine).toMatchObject({ enabled: true, webhooks: [{ id: view.id, url: "https://hooks.example.com/pharos", active: true }] });
    const theirs = (await call(luis, "GET", `/workspaces/${ws}/webhooks`)).json().webhooks[0];
    expect(theirs.url).toBe("hooks.example.com");
    expect((await call(luis, "POST", `/workspaces/${ws}/webhooks`, { name: "x", url: "https://a.example", events: ALL })).statusCode).toBe(403);
    expect((await call(luis, "POST", `/workspaces/${ws}/webhooks/${view.id}/rotate-secret`)).statusCode).toBe(403);
    const audit = (await pool.query(`SELECT payload FROM documents WHERE entity = 'audit_event' AND payload->>'entity' = 'webhook'`)).rows;
    expect(audit.map((r) => r.payload.action)).toEqual(["create"]);
    expect(JSON.stringify(audit)).not.toContain(secret.slice(6));
  });

  it("refuses targets it must not reach", async () => {
    const { ana, ws } = await team();
    for (const [url, reason] of [
      ["http://hooks.example.com/x", "scheme"],
      ["https://127.0.0.1/x", "private"],
      ["https://169.254.169.254/latest/meta-data", "private"],
      ["https://[::1]/x", "private"],
      ["https://localhost/x", "private"],
      ["https://user:pw@hooks.example.com/x", "credentials"],
      ["not a url", "invalid_url"],
    ]) {
      const res = await call(ana, "POST", `/workspaces/${ws}/webhooks`, { name: "x", url, events: ALL });
      expect(res.statusCode, url).toBe(400);
      expect(res.json(), url).toMatchObject({ code: "webhook_url", reason });
    }
  });

  it("edits, deactivates and deletes, each audited", async () => {
    const { ana, ws } = await team();
    const { view } = await hook(ana, ws);
    const off = await call(ana, "PATCH", `/workspaces/${ws}/webhooks/${view.id}`, { active: false, events: ["run.completed"] });
    expect(off.json()).toMatchObject({ active: false, disabledReason: "manual", events: ["run.completed"] });
    expect((await call(ana, "DELETE", `/workspaces/${ws}/webhooks/${view.id}`)).statusCode).toBe(204);
    expect((await call(ana, "GET", `/workspaces/${ws}/webhooks`)).json().webhooks).toEqual([]);
    const actions = (await pool.query(`SELECT payload->>'action' AS a FROM documents WHERE entity = 'audit_event' AND payload->>'entity' = 'webhook' ORDER BY seq`)).rows;
    expect(actions.map((r) => r.a)).toEqual(["create", "update", "delete"]);
  });
});

describe("events", () => {
  it("a desktop push produces run, cycle, defect and review events, filtered by project", async () => {
    const { ana, ws } = await team();
    await hook(ana, ws);
    await hook(ana, ws, { name: "Solo API", projectId: "p2" });
    const push = (deltas: object[]) => call(ana, "POST", "/sync/push", { workspaceId: ws, deltas });
    await push([delta("run", "r1", { projectId: "p1", runKey: "RUN-001", title: "Nightly", status: "in_progress" })]);
    await push([delta("run", "r1", { projectId: "p1", runKey: "RUN-001", title: "Nightly", status: "completed" }, 2, H(2))]);
    await push([delta("test_cycle", "cy1", { projectId: "p1", cycleKey: "CYC-001", title: "Sprint", status: "active" })]);
    await push([delta("test_cycle", "cy1", { projectId: "p1", cycleKey: "CYC-001", title: "Sprint", status: "closed" }, 2, H(2))]);
    await push([delta("defect", "d1", { ...DEFECT, status: "open" })]);
    await push([delta("defect", "d1", { ...DEFECT, status: "fixed", resolution: "fixed" }, 2, H(2))]);
    await push([delta("test_case", "c1", { projectId: "p1", scenarioId: "PAY-001", title: "Pagar", status: "reviewed" })]);
    await push([delta("test_case", "c1", { projectId: "p1", scenarioId: "PAY-001", title: "Pagar", status: "approved" }, 2, H(2))]);
    const types = (await deliveries()).map((d) => d.event_type);
    expect(types).toEqual([
      "run.created",
      "run.completed",
      "cycle.closed",
      "defect.created",
      "defect.status_changed",
      "review.decided",
    ]);
    const changed = (await deliveries()).find((d) => d.event_type === "defect.status_changed");
    expect(changed.payload).toMatchObject({
      type: "defect.status_changed",
      workspace: { id: ws, name: "QA Pagos" },
      project: { id: "p1", name: "Pagos Web" },
      actor: { kind: "user", id: ana.userId },
      data: { defect: { key: "DEF-001" }, from: "open", to: "fixed" },
    });
  });

  it("an API upload produces run.created, run.results_uploaded with counts, and run.completed; all are signed", async () => {
    const { ana, ws } = await team();
    const { secret } = await hook(ana, ws);
    const token = (await call(ana, "POST", `/workspaces/${ws}/tokens`, { name: "CI", projectId: "p1", scopes: ["runs:write"], expiresAt: inDays(5) })).json().token;
    const junit = `<?xml version="1.0"?><testsuites><testsuite name="s"><testcase classname="s" name="a"/><testcase classname="s" name="b"><failure message="x"/></testcase></testsuite></testsuites>`;
    const up = await app.inject({
      method: "POST",
      url: "/api/v1/projects/p1/results",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/xml" },
      payload: junit,
    });
    expect(up.statusCode).toBe(201);
    // One transaction: the order between them is not part of the contract.
    expect((await deliveries()).map((d) => d.event_type).sort()).toEqual(["run.completed", "run.created", "run.results_uploaded"]);
    expect(await app.webhookDispatcher.runOnce()).toBe(3);
    expect(sent).toHaveLength(3);
    for (const s of sent) {
      expect(s.url).toBe("https://hooks.example.com/pharos");
      expect(verify(secret, s.headers, s.body)).toBe(true);
      expect(verify(secret, s.headers, `${s.body} `)).toBe(false);
    }
    const uploaded = JSON.parse(sent.find((s) => JSON.parse(s.body).type === "run.results_uploaded")!.body);
    expect(uploaded.data).toMatchObject({ shard: { format: "junit" }, counts: { passed: 1, failed: 1, findings: 0 } });
    expect((await deliveries()).every((d) => d.status === "delivered")).toBe(true);
    // Nothing is sent twice.
    expect(await app.webhookDispatcher.runOnce()).toBe(0);
  });

  it("an inactive webhook queues nothing; «Enviar prueba» sends a ping", async () => {
    const { ana, ws } = await team();
    const { view, secret } = await hook(ana, ws);
    await call(ana, "PATCH", `/workspaces/${ws}/webhooks/${view.id}`, { active: false });
    await call(ana, "POST", "/sync/push", { workspaceId: ws, deltas: [delta("run", "r9", { projectId: "p1", runKey: "RUN-009", title: "x", status: "in_progress" })] });
    expect(await deliveries()).toEqual([]);
    await call(ana, "PATCH", `/workspaces/${ws}/webhooks/${view.id}`, { active: true });
    expect((await call(ana, "POST", `/workspaces/${ws}/webhooks/${view.id}/test`)).statusCode).toBe(202);
    await app.webhookDispatcher.runOnce();
    expect(JSON.parse(sent[0].body)).toMatchObject({ type: "ping", data: { webhook: { id: view.id } } });
    expect(verify(secret, sent[0].headers, sent[0].body)).toBe(true);
  });
});

describe("retries, abandon and auto-disable", () => {
  async function queued() {
    const { ana, ws } = await team();
    const { view } = await hook(ana, ws);
    await call(ana, "POST", `/workspaces/${ws}/webhooks/${view.id}/test`);
    return { ana, ws, view };
  }

  it("a failure is retried later, with what the target answered", async () => {
    const { ana, ws, view } = await queued();
    answer = { ok: false, status: 503, error: null, durationMs: 9, response: "upstream unavailable" };
    await app.webhookDispatcher.runOnce();
    const [d] = await deliveries();
    expect(d).toMatchObject({ status: "failed", attempt: 1 });
    const next = (await pool.query("SELECT next_attempt_at - now() AS wait FROM webhook_deliveries")).rows[0].wait;
    expect(next.seconds ?? next.minutes * 60).toBeGreaterThan(20);
    expect(await app.webhookDispatcher.runOnce()).toBe(0);
    const list = (await call(ana, "GET", `/workspaces/${ws}/webhooks/${view.id}/deliveries`)).json().deliveries;
    expect(list[0]).toMatchObject({ status: "failed", lastStatus: 503, lastResponse: "upstream unavailable" });
    // «Reintentar ahora».
    answer = { ok: true, status: 204, error: null, durationMs: 4, response: null };
    await call(ana, "POST", `/workspaces/${ws}/webhooks/${view.id}/deliveries/${list[0].id}/redeliver`);
    await app.webhookDispatcher.runOnce();
    expect((await deliveries())[0]).toMatchObject({ status: "delivered", attempt: 2 });
  });

  it(`the ${MAX_ATTEMPTS}th failure abandons the delivery`, async () => {
    await queued();
    answer = { ok: false, status: 500, error: null, durationMs: 1, response: null };
    await pool.query(`UPDATE webhook_deliveries SET attempt = ${MAX_ATTEMPTS - 1}`);
    await app.webhookDispatcher.runOnce();
    expect((await deliveries())[0]).toMatchObject({ status: "abandoned", attempt: MAX_ATTEMPTS });
  });

  it(`${DISABLE_AFTER_FAILURES} failures in a row disable the webhook and tell the Test Managers`, async () => {
    const { ana, ws, view } = await queued();
    answer = { ok: false, status: null, error: "ECONNREFUSED", durationMs: 1, response: null };
    await pool.query(`UPDATE webhooks SET consecutive_failures = ${DISABLE_AFTER_FAILURES - 1}`);
    await app.webhookDispatcher.runOnce();
    const listed = (await call(ana, "GET", `/workspaces/${ws}/webhooks`)).json().webhooks[0];
    expect(listed).toMatchObject({ id: view.id, active: false, disabledReason: "failures" });
    const n = (await call(ana, "GET", "/api/me/notifications")).json();
    expect(JSON.stringify(n)).toContain("webhook.disabled");
    // Turning it on again resends what is pending.
    answer = { ok: true, status: 200, error: null, durationMs: 1, response: null };
    await call(ana, "PATCH", `/workspaces/${ws}/webhooks/${view.id}`, { active: true });
    await app.webhookDispatcher.runOnce();
    expect((await deliveries())[0].status).toBe("delivered");
  });
});

describe("signing", () => {
  it("during a rotation both secrets sign; afterwards only the new one", async () => {
    const { ana, ws } = await team();
    const first = await hook(ana, ws);
    const rotated = (await call(ana, "POST", `/workspaces/${ws}/webhooks/${first.view.id}/rotate-secret`)).json();
    expect(rotated.secret).not.toBe(first.secret);
    await call(ana, "POST", `/workspaces/${ws}/webhooks/${first.view.id}/test`);
    await app.webhookDispatcher.runOnce();
    expect(sent[0].headers["webhook-signature"].split(" ")).toHaveLength(2);
    expect(verify(first.secret, sent[0].headers, sent[0].body)).toBe(true);
    expect(verify(rotated.secret, sent[0].headers, sent[0].body)).toBe(true);
    await pool.query("UPDATE webhooks SET previous_until = now() - interval '1 second'");
    await call(ana, "POST", `/workspaces/${ws}/webhooks/${first.view.id}/test`);
    await app.webhookDispatcher.runOnce();
    expect(verify(first.secret, sent[1].headers, sent[1].body)).toBe(false);
    expect(verify(rotated.secret, sent[1].headers, sent[1].body)).toBe(true);
  });

  it("a receiver refuses an old timestamp", () => {
    const now = 1_800_000_000;
    expect(verify("whsec_AAAA", { "webhook-id": "x", "webhook-timestamp": String(now - 3600), "webhook-signature": "v1,x" }, "{}", now)).toBe(false);
  });
});

describe("the SSRF guard", () => {
  it("classifies addresses", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:8.8.8.8"]) {
      expect(isPrivateAddress(a), a).toBe(true);
    }
    for (const a of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(a), a).toBe(false);
  });

  it("allows plain http only to a private target the server allows", () => {
    const closed = { allowPrivate: false, allowHosts: [] };
    const lan = { allowPrivate: true, allowHosts: [] };
    expect(checkUrl("http://10.0.0.5:8080/hook", closed)).toBe("private");
    expect(checkUrl("http://10.0.0.5:8080/hook", lan)).toBeNull();
    expect(checkUrl("http://hooks.example.com/x", lan)).toBe("scheme");
    expect(checkUrl("https://jenkins.lan/x", { allowPrivate: false, allowHosts: ["jenkins.lan"] })).toBeNull();
  });

  it("a name that resolves to a private address is refused when connecting (rebinding)", async () => {
    const r = await httpSender("https://localtest.me/x", "{}", {}, { allowPrivate: false, allowHosts: [] });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/EPRIVATE|ENOTFOUND|EAI_AGAIN/);
  });

  it("delivers for real to an allowed private receiver, without following redirects", async () => {
    const got: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
    const server: Server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        got.push({ headers: req.headers, body });
        if (req.url === "/moved") {
          res.writeHead(302, { location: "http://169.254.169.254/" }).end();
        } else res.writeHead(200).end("thanks");
      });
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const port = (server.address() as AddressInfo).port;
    try {
      const policy = { allowPrivate: true, allowHosts: [] };
      const r = await httpSender(`http://127.0.0.1:${port}/hook`, '{"a":1}', { "webhook-id": "x" }, policy);
      expect(r).toMatchObject({ ok: true, status: 200, response: "thanks" });
      expect(got[0]).toMatchObject({ body: '{"a":1}', headers: { "webhook-id": "x", "user-agent": "Pharos-Webhooks/1" } });
      const moved = await httpSender(`http://127.0.0.1:${port}/moved`, "{}", {}, policy);
      expect(moved).toMatchObject({ ok: false, status: 302, error: "redirect not followed" });
      expect(got).toHaveLength(2);
      const closed = await httpSender(`http://127.0.0.1:${port}/hook`, "{}", {}, { allowPrivate: false, allowHosts: [] });
      expect(closed).toMatchObject({ ok: false, error: "url: private" });
      expect(got).toHaveLength(2);
    } finally {
      server.close();
    }
  });
});

describe("without WEBHOOK_SECRETS_KEY", () => {
  it("webhooks are off and nothing is stored", async () => {
    const other = await setupTestApp({ WEBHOOK_SECRETS_KEY: undefined });
    try {
      await truncateAll(other.pool);
      const res = await other.app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: "x@pharos.dev", password: "supersecret1", displayName: "x", firstName: "F", lastName: "L" },
      });
      const a = { token: res.json().accessToken, userId: res.json().user.id };
      const ws = (
        await other.app.inject({ method: "POST", url: "/workspaces", headers: session(a), payload: { name: "W" } })
      ).json().id;
      const list = await other.app.inject({ method: "GET", url: `/workspaces/${ws}/webhooks`, headers: session(a) });
      expect(list.json()).toMatchObject({ enabled: false, webhooks: [] });
      const made = await other.app.inject({
        method: "POST",
        url: `/workspaces/${ws}/webhooks`,
        headers: session(a),
        payload: { name: "x", url: "https://hooks.example.com/x", events: ["run.completed"] },
      });
      expect(made.json().code).toBe("webhooks_disabled");
    } finally {
      await other.app.close();
      await other.pool.end();
    }
  });
});
