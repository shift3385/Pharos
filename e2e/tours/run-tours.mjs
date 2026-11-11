// Guided tours of every screen + the user manual (MAN-01). One command:
//
//   npm run manual                  isolated DB + API + tour build + tours + manual
//   E2E_SKIP_BUILD=1 npm run manual reuse the last tour build
//   npm run manual -- --spec 04     the preparation tour + the tours whose file name
//                                   matches (a regular expression) + the chapters
//                                   they read data from; no manual
//   npm run manual -- --no-manual   all the tours, no manual (CI on pull requests)
//
// Isolation (e2e/README.md → Tours). Everything runs apart from the user's own
// API, database, downloads and keychain:
//   - an API on PHAROS_TOURS_PORT (default 3100; 3000 is refused), started with
//     `tsx src/server.ts` directly (not `npm start`, whose prestart stops Pharos
//     APIs on its port), so nothing else is ever stopped;
//   - its own database, `pharos_test_db_tours`, created at the start and dropped
//     at the end. Only the host and credentials of TEST_DATABASE_URL are used;
//   - a debug binary built with VITE_API_URL and a CSP pointing at that port, in
//     its own target dir (`<cargo target>/tours`);
//   - an isolated app profile (PHAROS_E2E_PROFILE=tours-<ts>) whose downloads go
//     to e2e/results/tours/downloads and whose keychain entries are removed at
//     the end, also after Ctrl+C.
//
// AI key: PHAROS_TOURS_AI_KEY, else ANTHROPIC_API_KEY in `.env`
// (scripts/manual/ai-key.mjs). It is held apart from process.env and handed
// only to the WebdriverIO run (never to the API, the migrations, the seed or
// the build). After the tours, the secret scan runs FIRST; files that contain
// the key are deleted and a marker tells CI not to upload any results.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { owners } from "../../scripts/api-port.mjs";
import { findAiKey, readDotenv } from "../../scripts/manual/ai-key.mjs";
import { PERSONA } from "../../scripts/manual/persona.mjs";
import { acquireLock, lockMessage, releaseLock } from "../../scripts/manual/run-lock.mjs";
import { scanForSecret } from "../../scripts/manual/secret-scan.mjs";
import { driverVersion, major, webview2Version } from "../scripts/edge-driver.mjs";
import { selectTours } from "./manifest.ts";

const toursDir = fileURLToPath(new URL(".", import.meta.url));
const repoDir = join(toursDir, "..", "..");
const serverDir = join(repoDir, "server");
const outDir = join(repoDir, "e2e", "results", "tours");
/** Present when the secret scan found the key: CI uploads nothing then. */
export const SCAN_FAILED_MARKER = join(outDir, "SECRET-SCAN-FAILED");
const isWindows = process.platform === "win32";

export const TOURS_DB = "pharos_test_db_tours";
const port = Number(process.env.PHAROS_TOURS_PORT || 3100);
/** Liomar's password on the tour database (dropped after the run). */
const TOURS_PASSWORD = "faro-liomar-2026";
const apiUrl = `http://localhost:${port}`;

const args = process.argv.slice(2);
const specFilter = args.includes("--spec") ? args[args.indexOf("--spec") + 1] : null;
const noManual = args.includes("--no-manual") || specFilter !== null;

// The AI key stays out of process.env: no child sees it unless it is passed
// on purpose (only the WebdriverIO run and the in-process scan use it).
const ai = findAiKey(repoDir);
for (const k of Object.keys(process.env)) if (k.startsWith("PHAROS_TOURS_AI_")) delete process.env[k];
const aiEnv = ai
  ? {
      PHAROS_TOURS_AI_KEY: ai.key,
      ...(ai.provider ? { PHAROS_TOURS_AI_PROVIDER: ai.provider } : {}),
      ...(ai.model ? { PHAROS_TOURS_AI_MODEL: ai.model } : {}),
      ...(ai.baseUrl ? { PHAROS_TOURS_AI_BASE_URL: ai.baseUrl } : {}),
      ...(ai.maxCalls ? { PHAROS_TOURS_AI_MAX_CALLS: ai.maxCalls } : {}),
    }
  : {};

function fail(message) {
  console.error(`\n✖ Tours: ${message}`);
  process.exit(1);
}

function run(command, cmdArgs, options = {}) {
  const result = spawnSync(command, cmdArgs, { cwd: repoDir, stdio: "inherit", shell: isWindows, ...options });
  return result.status ?? 1;
}

function listening(p) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: p }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// ---- Guards -------------------------------------------------------------------

// One run at a time (scripts/manual/run-lock.mjs), taken before anything
// else: the port check below cannot see a run that is still building, and
// that run's database would be dropped under it. Released on every exit
// (fail(), the end of the run, Ctrl+C), never another run's lock.
const lock = acquireLock();
if (!lock.ok) {
  console.error(`\n✖ Tours: ${lockMessage(lock.holder)}`);
  process.exit(1);
}
process.on("exit", () => releaseLock());

// A partial run adds the chapters its tours read data from; a bad filter stops
// here, before the database and the long build.
if (specFilter) {
  try {
    const { files, added } = selectTours(specFilter);
    console.log(`› --spec "${specFilter}": ${files.length - 1} tour(s) after the preparation`);
    if (added.length > 0) console.log(`› Added because the others read their data: ${added.join(", ")}`);
  } catch (err) {
    fail(err.message);
  }
}

if (!isWindows) fail("the tours run on Windows (WebView2 + msedgedriver).");
if (!Number.isInteger(port) || port <= 0) fail("PHAROS_TOURS_PORT is not a port number.");
if (port === 3000) fail("port 3000 is the user's own API: the tours never use it.");
if ((await listening(port)) || owners(port).length > 0) {
  fail(`port ${port} is already in use. The tours never stop other programs: free it or set PHAROS_TOURS_PORT.`);
}

/** TEST_DATABASE_URL (environment or `.env`) pointed at the tour DB. Errors
 *  never echo the URL: it holds the database password. */
function toursDatabaseUrl() {
  const raw = process.env.TEST_DATABASE_URL || readDotenv(join(repoDir, ".env")).TEST_DATABASE_URL;
  if (!raw) fail("TEST_DATABASE_URL is not set (copy .env.example to .env).");
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("TEST_DATABASE_URL is not a valid URL (its value is not shown: it holds a password).");
  }
  url.pathname = `/${TOURS_DB}`;
  return url;
}
const dbUrl = toursDatabaseUrl();

// ---- Driver prerequisites (same as the smoke) ------------------------------------

if (spawnSync(process.env.TAURI_DRIVER ?? "tauri-driver", ["--help"], { stdio: "ignore" }).error) {
  fail("tauri-driver not found. Install it with `cargo install tauri-driver --locked`.");
}
const webview = webview2Version();
let driver = null;
try {
  driver = driverVersion();
} catch (err) {
  fail(`${err.message} Run \`npm run e2e:driver\` to download it again.`);
}
if (!webview) fail("WebView2 runtime not found.");
if (!driver) fail("msedgedriver missing. Run `npm run e2e:driver`.");
if (major(driver) !== major(webview)) fail(`msedgedriver ${driver} does not match WebView2 ${webview}. Run \`npm run e2e:driver\`.`);

// ---- Database -------------------------------------------------------------------

const pg = createRequire(join(serverDir, "package.json"))("pg");

/** Runs SQL against the server's maintenance DB (`postgres`). */
async function admin(sql) {
  const url = new URL(dbUrl);
  url.pathname = "/postgres";
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

const dropDatabase = () => admin(`DROP DATABASE IF EXISTS ${TOURS_DB} WITH (FORCE)`);

// ---- Clean-up helpers --------------------------------------------------------------

const profile = `tours-${Date.now()}`;
let api;
let interrupted = false;

function stopApi() {
  if (api?.pid && api.exitCode === null) spawnSync("taskkill", ["/PID", String(api.pid), "/T", "/F"], { stdio: "ignore" });
}

/** Deletes the keychain entries of this tour profile (`<account>-e2e-<profile>.<service>`). */
function removeProfileCredentials() {
  let listing = "";
  try {
    listing = execFileSync("cmdkey", ["/list"], { encoding: "utf8" });
  } catch {
    return;
  }
  for (const [, target] of listing.matchAll(/target=(\S+)/gi)) {
    if (!target.includes(`-e2e-${profile}.`)) continue;
    spawnSync("cmdkey", [`/delete:${target}`], { stdio: "ignore" });
  }
}

// Ctrl+C: the children get it too and stop; then the `finally` below drops
// the database and removes the credentials before exiting with 130.
process.on("SIGINT", () => {
  interrupted = true;
  stopApi();
  // The lock goes with the run's `finally`/exit; a second Ctrl+C that kills
  // the process outright leaves a lock whose PID is gone, which the next run
  // treats as stale.
});
const checkInterrupted = () => {
  if (interrupted) throw new Error("interrupted (Ctrl+C)");
};

/** Names of the files the tours export (projects, plans, cases, the matrix,
 *  templates, diagnostics): what the Downloads guard looks for. */
export const TOUR_OUTPUT = /Banca|Portal Clientes|Proyecto de prueba|pharos|Plan de pruebas|BM-\d|PC-\d|matriz|trazabilidad|plantilla|\.feature$/i;

/** The user's real Downloads folder (Known Folder FOLDERID_Downloads). */
function userDownloadsDir() {
  try {
    const out = execFileSync(
      "reg",
      ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "/v", "{374DE290-123F-4565-9164-39C4925E467B}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const raw = /REG_(?:EXPAND_)?SZ\s+(.+)\s*$/m.exec(out)?.[1]?.trim();
    if (raw) return raw.replace(/%([^%]+)%/g, (_, v) => process.env[v] ?? `%${v}%`);
  } catch {
    // Not set: the default location.
  }
  return join(homedir(), "Downloads");
}

/** The tour binary's target dir: PHAROS_TOURS_TARGET_DIR, else `<cargo target>/tours`. */
function toursTargetDir() {
  if (process.env.PHAROS_TOURS_TARGET_DIR) return process.env.PHAROS_TOURS_TARGET_DIR;
  const metadata = JSON.parse(
    execFileSync("cargo", ["metadata", "--format-version", "1", "--no-deps", "--manifest-path", join(repoDir, "src-tauri", "Cargo.toml")], {
      encoding: "utf8",
    }),
  );
  return join(metadata.target_directory, "tours");
}

/** The tour build's config override: the app's CSP with the API port swapped. */
function writeToursConfig() {
  const conf = JSON.parse(readFileSync(join(repoDir, "src-tauri", "tauri.conf.json"), "utf8"));
  const csp = conf.app.security.csp.replaceAll(":3000", `:${port}`);
  if (csp.includes(":3000")) fail("the tour CSP still allows port 3000.");
  const file = join(outDir, "tauri.tours.json");
  writeFileSync(file, JSON.stringify({ app: { security: { csp } } }, null, 2));
  // Relative to the repo (the cwd): `run` goes through the Windows shell,
  // which would split an absolute path with spaces.
  return relative(repoDir, file);
}

/** With a key in play: no generated file may contain it. Deletes each file
 *  that does and leaves the marker that stops CI from uploading results. */
async function secretScan() {
  if (!ai) return;
  const hits = await scanForSecret(ai.key, [join(repoDir, "docs", "manual"), join(repoDir, "e2e", "results")], repoDir);
  if (hits.length === 0) {
    console.log("✓ Secret scan: the AI key appears in no generated file.");
    return;
  }
  for (const hit of new Set(hits.map((h) => h.split("!")[0]))) rmSync(join(repoDir, hit), { force: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(SCAN_FAILED_MARKER, `${hits.length} file(s) contained the AI key and were deleted.\n`);
  throw new Error(`the AI key appeared in ${hits.length} generated file(s); they were deleted (${hits.join(", ")}). Nothing must be shared from this run.`);
}

// ---- Run --------------------------------------------------------------------------

/** Environment of the API, the migrations and the seed: no AI variables. */
// JWT_ACCESS_SECRET: a checkout may have no `.env`, and the tour API signs only
// tokens for this run's throwaway database, so a random one is enough.
const childEnv = {
  ...process.env,
  PORT: String(port),
  HOST: "127.0.0.1",
  DATABASE_URL: dbUrl.toString(),
  NODE_ENV: "development",
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || readDotenv(join(repoDir, ".env")).JWT_ACCESS_SECRET || randomBytes(32).toString("hex"),
};
let exitCode = 1;

try {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  console.log(`› Creating the tour database ${TOURS_DB} (${dbUrl.hostname}:${dbUrl.port || 5432})`);
  await dropDatabase();
  await admin(`CREATE DATABASE ${TOURS_DB}`);
  if (run("npm", ["--prefix", "server", "run", "migrate"], { env: childEnv }) !== 0) throw new Error("the migrations failed on the tour database.");
  checkInterrupted();
  // No seeded account (NC-052): Liomar creates his own in chapter 1, on
  // screen, and every chapter uses it. The tours always run chapter 1.

  console.log(`› Starting the tour API on ${apiUrl}`);
  const log = openSync(join(outDir, "api.log"), "w");
  // `node <tsx cli> src/server.ts`: no shell, so the checkout path may hold spaces.
  api = spawn(process.execPath, [join(serverDir, "node_modules", "tsx", "dist", "cli.mjs"), "src/server.ts"], {
    cwd: serverDir,
    env: childEnv,
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  let up = false;
  for (let i = 0; i < 60 && !up && !interrupted; i++) {
    try {
      up = (await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  checkInterrupted();
  if (!up) throw new Error(`the tour API did not answer on ${apiUrl} (see e2e/results/tours/api.log).`);

  const targetDir = toursTargetDir();
  const binary = join(targetDir, "debug", "pharos.exe");
  if (!process.env.E2E_SKIP_BUILD) {
    console.log(`› Building the tour binary (API ${apiUrl}) into ${targetDir}`);
    const status = run("npx", ["tauri", "build", "--debug", "--no-bundle", "--config", writeToursConfig()], {
      env: { ...process.env, VITE_API_URL: apiUrl, CARGO_TARGET_DIR: targetDir },
    });
    checkInterrupted();
    if (status !== 0) throw new Error("the tour build failed.");
  }
  if (!existsSync(binary)) throw new Error(`tour binary not found at ${binary}.`);

  console.log(
    ai
      ? `› AI tours: on (provider ${ai.provider || "gemini"}, key from ${ai.source === "env" ? "the environment" : ai.source})`
      : "› AI tours: skipped — set PHAROS_TOURS_AI_KEY or ANTHROPIC_API_KEY in .env (e2e/README.md → Tours → IA)",
  );
  // Exports go to e2e/results/tours/downloads, never the user's Downloads:
  // the profile's downloads.json is written before the app first starts
  // (src-tauri/src/downloads.rs; app_config_dir is %APPDATA% on Windows).
  const downloads = join(outDir, "downloads");
  mkdirSync(downloads, { recursive: true });
  const configDir = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "com.pharos.desktop", "e2e", profile);
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "downloads.json"), JSON.stringify({ downloadDir: downloads }));

  const userDownloads = userDownloadsDir();
  const before = new Set(existsSync(userDownloads) ? readdirSync(userDownloads) : []);

  console.log("› Running the tours with WebdriverIO");
  let status;
  try {
    status = run("npx", ["wdio", "run", "e2e/wdio.tours.conf.ts"], {
      env: {
        ...process.env,
        ...aiEnv,
        PHAROS_E2E_APP: binary,
        PHAROS_E2E_PROFILE: profile,
        PHAROS_TOURS_DOWNLOADS: downloads,
        PHAROS_TOURS_API: apiUrl,
        // «Requisitos desde un proyecto»: the folder the debug build picks
        // instead of Windows' own picker (project_scan.rs, MAN-03).
        PHAROS_E2E_PICK_FOLDER: join(toursDir, "fixtures", "proyecto-billetera"),
        // The one account of the manual (a test address, never a real one).
        TEST_USER_EMAIL: PERSONA.email,
        TEST_USER_PASSWORD: TOURS_PASSWORD,
        ...(specFilter ? { PHAROS_TOURS_ONLY: specFilter } : {}),
      },
    });
  } finally {
    // First of all, whatever happened in the run: the secret scan.
    await secretScan();
  }
  checkInterrupted();
  // The tours must never write into the user's own Downloads folder. A new
  // file named like a tour export fails the run; any other new file (the
  // user's own download finishing meanwhile) is only reported, never touched.
  const added = (existsSync(userDownloads) ? readdirSync(userDownloads) : []).filter((f) => !before.has(f));
  const ours = added.filter((f) => TOUR_OUTPUT.test(f));
  if (added.length > ours.length) {
    console.warn(`! New files in the user's Downloads that the tours do not produce (left alone): ${added.filter((f) => !ours.includes(f)).join(", ")}`);
  }
  if (ours.length > 0) throw new Error(`the tours wrote into the user's Downloads folder: ${ours.join(", ")}.`);
  if (status !== 0) throw new Error("some tour steps failed (see the spec report above).");

  if (!specFilter) {
    // What really passed: an item covered only by skipped or failed steps fails.
    const childNoAi = { ...process.env, ...(ai ? { PHAROS_TOURS_AI_KEY: "set" } : {}) };
    if (run("node", ["scripts/check-manual.mjs", "--from-run"], { env: childNoAi }) !== 0) {
      throw new Error("the coverage of this run is incomplete (check-manual --from-run).");
    }
  }

  if (!noManual) {
    console.log("› Building the manual");
    if (run("node", ["scripts/build-manual.mjs", "--from-run"]) !== 0) throw new Error("the manual build failed.");
    await secretScan();
  }
  exitCode = 0;
} catch (err) {
  console.error(`\n✖ Tours: ${err.message}`);
} finally {
  stopApi();
  removeProfileCredentials();
  try {
    await dropDatabase();
    console.log(`› Dropped ${TOURS_DB}`);
  } catch (err) {
    console.error(`Could not drop ${TOURS_DB}: ${err.message}`);
    exitCode = 1;
  }
  releaseLock();
}
process.exit(interrupted ? 130 : exitCode);
