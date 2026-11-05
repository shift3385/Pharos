// The execution derivation on the web (step 10, EJE-04/EJE-03): the shared
// vectors the desktop checks too, and `GET /api/execution/summary` end to end
// with the exit criterion of 0.2.0 — a manual run and a Playwright run of the
// same case in one matrix, the latest final winning, and editing the case
// afterwards changing none of it.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import {
  criterionKind,
  home,
  naturalCmp,
  parseMetric,
  summarize,
  type ExecutionFilter,
  type HomeRequest,
  type ProjectData,
} from "../src/modules/domain/execution-summary";

/** Every key of `expected` is equal in `actual` (arrays element by element,
 *  same length), as the desktop's `assert_subset`. */
function expectSubset(expected: unknown, actual: unknown, path: string) {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    expect(actual && typeof actual === "object", path).toBe(true);
    for (const [k, v] of Object.entries(expected)) expectSubset(v, (actual as Record<string, unknown>)[k] ?? null, `${path}.${k}`);
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, `${path}: length`).toBe(expected.length);
    expected.forEach((x, i) => expectSubset(x, (actual as unknown[])[i], `${path}[${i}]`));
  } else {
    expect(actual, path).toEqual(expected);
  }
}

describe("shared execution vectors (the desktop checks the same file)", () => {
  const file = JSON.parse(
    readFileSync(new URL("../../src-tauri/tests/fixtures/execution-vectors.json", import.meta.url), "utf8"),
  ) as {
    cases: {
      name: string;
      kind: "summary" | "home";
      project?: ProjectData;
      filter?: ExecutionFilter;
      projects?: ProjectData[];
      request?: HomeRequest;
      expected: unknown;
    }[];
  };
  for (const c of file.cases) {
    it(c.name, () => {
      const got = c.kind === "summary" ? summarize(c.project!, c.filter!) : home(c.projects!, c.request!);
      expectSubset(c.expected, JSON.parse(JSON.stringify(got)), c.name);
    });
  }

  it("the order rows are read in does not matter", () => {
    for (const c of file.cases.filter((x) => x.kind === "summary")) {
      const p = c.project!;
      const reversed: ProjectData = {
        ...p,
        attempts: [...(p.attempts ?? [])].reverse(),
        defects: [...(p.defects ?? [])].reverse(),
        cases: [...(p.cases ?? [])].reverse(),
        runs: [...(p.runs ?? [])].reverse(),
      };
      expect(summarize(reversed, c.filter!), c.name).toEqual(summarize(p, c.filter!));
    }
  });

  it("orders keys, recognizes criteria and parses metrics like the desktop", () => {
    const keys = ["ATS_10", "ATS_2", "ATS_002", "ATS_1", "B", "A"].sort(naturalCmp);
    expect(keys).toEqual(["A", "ATS_1", "ATS_002", "ATS_2", "ATS_10", "B"]);
    expect(criterionKind("% de casos ejecutados")).toBe("executed");
    expect(criterionKind("Defectos críticos abiertos")).toBe("criticalDefects");
    expect(criterionKind("Tasa de éxito")).toBe("passRate");
    expect(criterionKind("Cobertura de requisitos")).toBe("coverage");
    expect(criterionKind("Sign-off by the PO")).toBeNull();
    expect(parseMetric("≥ 95%", "executed")).toEqual([">=", 95]);
    expect(parseMetric("95,5%", "executed")).toEqual([">=", 95.5]);
    expect(parseMetric("0", "criticalDefects")).toEqual(["=", 0]);
    expect(parseMetric("< 2", "criticalDefects")).toEqual(["<", 2]);
    expect(parseMetric("ninguno", "criticalDefects")).toBeNull();
    expect(parseMetric("1.2.3", "executed")).toBeNull();
  });
});

describe("GET /api/execution/summary", () => {
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

  const headers = (token: string) => ({
    authorization: `Bearer ${token}`,
    [VERSION_HEADER]: SERVER_VERSION,
    [FEATURES_HEADER]: SERVER_FEATURES.join(","),
  });
  async function register(email: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password: "supersecret1", displayName: "S", firstName: "A", lastName: "B" },
    });
    const token = res.json().accessToken as string;
    const call = async (method: "GET" | "POST" | "PUT", url: string, payload?: object) => {
      const r = await app.inject({ method, url, headers: headers(token), payload });
      return { status: r.statusCode, body: r.body ? r.json() : null };
    };
    return { call, userId: res.json().user.id as string };
  }
  const H = (wall: number) => `${String(wall).padStart(15, "0")}-00000-desk`;
  async function store(userId: string, entity: string, id: string, payload: Record<string, unknown>) {
    await pool.query(
      `INSERT INTO documents (user_id, entity, entity_id, payload, revision, author, deleted, hlc)
       VALUES ($1, $2, $3, $4, 1, 'u', false, $5)`,
      [userId, entity, id, payload, H(Date.now())],
    );
  }

  it("a manual and a Playwright run share the matrix; the latest final wins; editing the case changes nothing", async () => {
    const { call, userId } = await register("matrix@pharos.dev");
    const projectId = (await call("POST", "/api/projects", { name: "Checkout" })).body.id as string;
    await call("POST", "/api/requirements", { projectId, requirementKey: "REQ-001", title: "Pay" });
    const pay = (
      await call("POST", "/api/test-cases", {
        projectId,
        title: "Pay",
        status: "approved",
        priority: "high",
        data: { steps: ["open"], requirementKeys: ["REQ-001"] },
      })
    ).body;
    const key = pay.scenarioId as string;
    // A manual run (desktop, synced) fails on 1 Nov.
    await store(userId, "run", "run1", { id: "run1", projectId, runKey: "RUN-001", title: "Manual", trigger: "manual", status: "completed", startedAt: "2026-11-01T09:00:00Z", createdAt: "2026-11-01T09:00:00Z" });
    await store(userId, "result", "m1", {
      id: "m1", projectId, runId: "run1", testKey: `manual:${pay.id as string}/-/-`, testCaseId: pay.id, caseRevision: 1,
      status: "failed", attempt: 0, finishedAt: "2026-11-01T10:00:00Z", hlc: H(1),
    });
    let s = (await call("GET", `/api/execution/summary?projectId=${projectId}`)).body;
    expect(s.cases[0]).toMatchObject({ caseId: pay.id, status: "failed", last: { resultId: "m1", origin: "manual" } });

    // The Playwright report of 2 Nov passes it.
    await store(userId, "run", "run2", { id: "run2", projectId, runKey: "RUN-002", title: "CI", trigger: "import", sourceTool: "playwright", status: "completed", startedAt: "2026-11-02T09:00:00Z", createdAt: "2026-11-02T09:00:00Z", build: "1.4.2" });
    await store(userId, "run_shard", "s1", { id: "s1", projectId, runId: "run2", sourceFileSha256: "abc", normalizerVersion: 1, importedAt: "2026-11-02T09:05:00Z" });
    await store(userId, "result", "i1", {
      id: "i1", projectId, runId: "run2", shardId: "s1", testKey: "pay.spec.ts::pays", configurationLabel: "chromium",
      status: "passed", attempt: 0, finishedAt: "2026-11-02T09:00:01Z", attributes: { tags: [`@${key}`], name: "pays" }, hlc: H(2),
    });
    s = (await call("GET", `/api/execution/summary?projectId=${projectId}`)).body;
    expect(s.contractVersion).toBe(1);
    expect(s.runs.map((r: { id: string }) => r.id)).toEqual(["run2", "run1"]);
    expect(s.cases[0]).toMatchObject({ status: "passed", last: { resultId: "i1", runKey: "RUN-002", origin: "imported", sourceTool: "playwright" } });
    expect(s.requirements[0]).toMatchObject({ requirementKey: "REQ-001", status: "passed", covered: true });
    expect(s.options.builds).toEqual(["1.4.2"]);
    // Filtered to the manual run's build (none): only the CI build has runs.
    const ci = (await call("GET", `/api/execution/summary?projectId=${projectId}&build=1.4.2`)).body;
    expect(ci.runs).toHaveLength(1);

    // Editing the case changes none of it; the result becomes stale.
    const before = s.cases[0];
    const put = await call("PUT", `/api/test-cases/${pay.id as string}`, {
      input: { projectId, title: "Pay by card", status: "approved", priority: "high", data: { steps: ["open", "pay"], requirementKeys: ["REQ-001"] } },
      revision: pay.revision,
    });
    expect(put.status).toBe(200);
    const after = (await call("GET", `/api/execution/summary?projectId=${projectId}`)).body.cases[0];
    expect(after.status).toBe(before.status);
    expect(after.last.resultId).toBe(before.last.resultId);
    expect(after.last.revisionId).toBe(before.last.revisionId);
  });

  it("dayStarts, periods and other users", async () => {
    const { call } = await register("daily@pharos.dev");
    const projectId = (await call("POST", "/api/projects", { name: "Daily" })).body.id as string;
    const ok = await call("GET", `/api/execution/summary?projectId=${projectId}&dayStarts=1792792800000,1792879200000&from=1&to=2`);
    expect(ok.status).toBe(200);
    expect(ok.body.daily.map((d: { dayStart: number }) => d.dayStart)).toEqual([1792792800000, 1792879200000]);
    expect(ok.body.filter).toMatchObject({ from: 1, to: 2 });
    expect((await call("GET", `/api/execution/summary?projectId=${projectId}&dayStarts=a,b`)).status).toBe(400);
    const other = await register("other@pharos.dev");
    expect((await other.call("GET", `/api/execution/summary?projectId=${projectId}`)).body).toBeNull();
  });
});
