// INT-04 smoke test (ADR-0054 §5): the `pharos-report` GitHub action against
// a real Pharos server, with the four formats of the 0.6.0 exit criterion
// (JUnit, SARIF, k6, axe) going into one run.
//
//   node scripts/int04-smoke.mjs            local: everything, then clean up
//   node scripts/int04-smoke.mjs serve      CI: start the API, export PHAROS_*
//   node scripts/int04-smoke.mjs verify     CI: check what the action reported
//
// The API runs on PHAROS_TOURS_PORT (default 3120; 3000, the user's own API,
// is refused) over its own database, pharos_test_db_int04 on the server of
// TEST_DATABASE_URL (environment or `.env`; only its host and credentials are
// used). The account and the project token are throwaway, and the token is
// never printed (masked in GitHub Actions).
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = join(repoDir, "server");
const outDir = join(repoDir, "e2e", "results", "int04");
const mode = process.argv[2] ?? "local";
const port = Number(process.env.PHAROS_TOURS_PORT || 3120);
const DB = "pharos_test_db_int04";
const api = `http://127.0.0.1:${port}`;
const fixture = (p) => join("packages", "formats", "src", "fixtures", p);
/** The reports of the exit criterion, relative to the repository. */
export const REPORTS = [
  fixture("ing01/single/pw-junit.xml"),
  fixture("sarif/eslint.sarif"),
  fixture("k6/summary-export.json"),
  fixture("axe/checkout-broken.json"),
];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function readDotenv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
  );
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---- the server -------------------------------------------------------------------------

async function startServer({ detached }) {
  if (port === 3000) fail("port 3000 is the user's own API; set PHAROS_TOURS_PORT.");
  const raw = process.env.TEST_DATABASE_URL || readDotenv(join(repoDir, ".env")).TEST_DATABASE_URL;
  if (!raw) fail("TEST_DATABASE_URL is not set (environment or .env).");
  const require = createRequire(join(serverDir, "package.json"));
  const { Client } = require("pg");
  const base = new URL(raw);
  const admin = new URL(base);
  admin.pathname = "/postgres";
  const db = new URL(base);
  db.pathname = `/${DB}`;
  const sql = async (text) => {
    const c = new Client({ connectionString: admin.toString() });
    await c.connect();
    try {
      await c.query(text);
    } finally {
      await c.end();
    }
  };
  await sql(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await sql(`CREATE DATABASE ${DB}`);
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    DATABASE_URL: db.toString(),
    NODE_ENV: "development",
    JWT_ACCESS_SECRET: randomBytes(32).toString("hex"),
  };
  const tsx = join(serverDir, "node_modules", "tsx", "dist", "cli.mjs");
  const migrated = spawnSync(process.execPath, [tsx, "src/db/migrate-cli.ts"], { cwd: serverDir, env, encoding: "utf8" });
  if (migrated.status !== 0) fail(`the migrations failed:\n${migrated.stderr.slice(-800)}`);
  mkdirSync(outDir, { recursive: true });
  const log = openSync(join(outDir, "api.log"), "w");
  const server = spawn(process.execPath, [tsx, "src/server.ts"], {
    cwd: serverDir,
    env,
    stdio: ["ignore", log, log],
    windowsHide: true,
    detached,
  });
  if (detached) server.unref();
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${api}/health`)).ok) return { server, dropDb: () => sql(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`) };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail(`the API did not answer on ${api} (see e2e/results/int04/api.log).`);
}

/** A throwaway account, a workspace, project INT- with case INT-001, and a
 *  project token for CI. */
async function setUp() {
  const json = async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) });
  const email = `int04-${randomBytes(4).toString("hex")}@pharos.test`;
  const password = randomBytes(12).toString("hex");
  const reg = await json(
    await fetch(`${api}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "CI", firstName: "CI", lastName: "Pharos" }),
    }),
  );
  if (reg.status !== 201) fail(`register: HTTP ${reg.status}`);
  // The sync headers of a current app (server/src/modules/sync/sync.version.ts).
  const versionTs = readFileSync(join(serverDir, "src", "modules", "sync", "sync.version.ts"), "utf8");
  const features = [...(/export const SERVER_FEATURES = \[([\s\S]*?)\]/.exec(versionTs)?.[1] ?? "").matchAll(/"([^"]+)"/g)]
    .map((m) => m[1])
    .join(",");
  const version = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf8")).version;
  const call = async (method, path, body) =>
    json(
      await fetch(`${api}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${reg.body.accessToken}`,
          "content-type": "application/json",
          "x-pharos-version": version,
          "x-pharos-sync-features": features,
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  const ws = (await call("POST", "/workspaces", { name: "INT-04" })).body.id;
  if (!ws) fail("could not create the workspace");
  const hlc = `${String(1).padStart(15, "0")}-00000-dev`;
  const delta = (entity, id, payload) => ({
    entity,
    entityId: id,
    op: "upsert",
    revision: 1,
    author: "CI",
    hlc,
    payload: { id, workspaceId: ws, ...payload },
  });
  const pushed = await call("POST", "/sync/push", {
    workspaceId: ws,
    deltas: [
      delta("project", "p-int04", { name: "INT-04", caseIdPrefix: "INT-" }),
      delta("test_case", "c-int04", { projectId: "p-int04", scenarioId: "INT-001", title: "Caso uno" }),
    ],
  });
  if (pushed.body.accepted !== 2) fail(`could not push the project: HTTP ${pushed.status}`);
  const tok = await call("POST", `/workspaces/${ws}/tokens`, {
    name: "CI",
    projectId: "p-int04",
    scopes: ["projects:read", "runs:read", "runs:write"],
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  if (tok.status !== 201) fail(`could not create the token: HTTP ${tok.status}`);
  return { token: tok.body.token, project: "INT" };
}

// ---- the action -------------------------------------------------------------------------

/** Runs the action's own script, as the composite step does. */
function runAction(inputs, gh = {}) {
  mkdirSync(outDir, { recursive: true });
  const output = join(outDir, `output-${randomBytes(3).toString("hex")}.txt`);
  const summary = join(outDir, "summary.md");
  const r = spawnSync("bash", [join(".github", "actions", "pharos-report", "upload.sh")], {
    cwd: repoDir,
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, ...gh, ...inputs },
  });
  const outputs = existsSync(output)
    ? Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]))
    : {};
  // `::add-mask::<token>` is how the action tells GitHub to hide the token:
  // the runner consumes that line and never shows it, so it is left out here.
  const out = `${r.stdout}\n${r.stderr}`
    .split("\n")
    .filter((l) => !l.startsWith("::add-mask::"))
    .join("\n");
  return { code: r.status, out, outputs };
}

async function getRun(token, project, key) {
  const res = await fetch(`${api}/api/v1/projects/${project}/runs/${encodeURIComponent(key)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ---- modes ------------------------------------------------------------------------------

async function local() {
  const { server, dropDb } = await startServer({ detached: false });
  try {
    const { token, project } = await setUp();
    check(`API on ${api} with ${DB}`, true);
    const inputs = { PHAROS_SERVER: api, PHAROS_TOKEN: token, PHAROS_PROJECT: project };

    // 1. The exit criterion: JUnit, SARIF, k6 and axe into one run.
    let r = runAction({ ...inputs, PHAROS_FILES: REPORTS.join("\n"), PHAROS_RUN_NAME: "INT-04 smoke", PHAROS_CLOSE: "true" });
    if (r.out.includes(token)) fail("THE TOKEN WAS PRINTED");
    check("the action uploads JUnit, SARIF, k6 and axe", r.code === 0 && r.outputs.uploaded === "4" && r.outputs.failed === "0", `exit ${r.code}, ${r.outputs.uploaded} uploaded`);
    for (const name of ["JUnit", "SARIF", "k6", "axe"]) check(`${name} detected by the server`, r.out.includes(`· ${name} ·`));
    const run = await getRun(token, project, r.outputs["run-key"]);
    check("one run, closed by the action", run.status === 200 && run.body.run?.status === "completed", `${r.outputs["run-key"]} ${run.body.run?.status}`);
    check("its JUnit results are in", (run.body.counts?.results ?? 0) > 0, `${run.body.counts?.results} results`);
    const summary = readFileSync(join(outDir, "summary.md"), "utf8");
    check("the job summary has a row per report", ["JUnit", "SARIF", "k6", "axe"].every((f) => summary.includes(`| ${f} |`)));

    // 2. A matrix: two jobs, one externalId, the last one closes.
    const gh = { GITHUB_RUN_ID: "424242", GITHUB_RUN_ATTEMPT: "1", GITHUB_REPOSITORY: "acme/pagos", GITHUB_WORKFLOW: "CI", GITHUB_REF_NAME: "main", GITHUB_SHA: "abcdef1234567" };
    const a = runAction({ ...inputs, PHAROS_FILES: fixture("ing01/shard1/pw-junit.xml") }, gh);
    const b = runAction({ ...inputs, PHAROS_FILES: fixture("ing01/shard2/pw-junit.xml") }, gh);
    check("two matrix jobs converge on one run", a.code === 0 && b.code === 0 && a.outputs["run-key"] === b.outputs["run-key"], a.outputs["run-key"]);
    const last = runAction({ ...inputs, PHAROS_FILES: "", PHAROS_CLOSE: "true" }, gh);
    const closed = await getRun(token, project, a.outputs["run-key"]);
    check("the last job closes it by externalId", last.code === 0 && closed.body.run?.status === "completed", closed.body.run?.status);

    // 3. Failures.
    r = runAction({ ...inputs, PHAROS_TOKEN: "phr_prj_not-a-real-token", PHAROS_FILES: REPORTS[0] });
    check("a bad token fails the step", r.code === 1 && /HTTP 401/.test(r.out));
    r = runAction({ ...inputs, PHAROS_TOKEN: "", PHAROS_FILES: REPORTS[0] });
    check("a fork PR without secrets is skipped, not failed", r.code === 0 && /no report was uploaded/.test(r.out));
    r = runAction({ ...inputs, PHAROS_FILES: "no/such/report.xml" });
    check("no report found fails the step", r.code === 1 && /No report file was found/.test(r.out));
  } finally {
    if (server.pid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      else server.kill();
    }
    await new Promise((r) => setTimeout(r, 1000));
    await dropDb().catch(() => {});
    rmSync(outDir, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

/** CI: start the API (it outlives this step) and export what the action
 *  needs to the next steps, the token masked. */
async function serve() {
  await startServer({ detached: true });
  const { token, project } = await setUp();
  const env = process.env.GITHUB_ENV;
  if (!env) fail("serve is for GitHub Actions (GITHUB_ENV is not set).");
  console.log(`::add-mask::${token}`);
  appendFileSync(env, `PHAROS_URL=${api}\nPHAROS_TOKEN=${token}\nPHAROS_PROJECT=${project}\n`);
  console.log(`✓ API on ${api}, project ${project}, token exported (masked).`);
}

/** CI: what the action reported (outputs passed as PHAROS_RESULT_*). */
async function verify() {
  const e = process.env;
  check("four reports uploaded, none failed", e.PHAROS_RESULT_UPLOADED === "4" && e.PHAROS_RESULT_FAILED === "0", `${e.PHAROS_RESULT_UPLOADED} uploaded, ${e.PHAROS_RESULT_FAILED} failed`);
  const run = await getRun(e.PHAROS_TOKEN, e.PHAROS_PROJECT, e.PHAROS_RESULT_RUN_KEY ?? "");
  check("the run is on the server with its results", run.status === 200 && (run.body.counts?.results ?? 0) > 0, `${e.PHAROS_RESULT_RUN_KEY}: ${run.body.counts?.results} results`);
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const run = { local, serve, verify }[mode];
  if (!run) fail(`unknown mode «${mode}»: local, serve or verify`);
  await run();
}
