// One command for the desktop smoke (BASE-14):
//
//   npm run e2e                 preflight + debug build + WebdriverIO
//   E2E_SKIP_BUILD=1 npm run e2e  reuse the last debug build
//
// Preflight fails fast with the fix for each missing prerequisite: the API
// (and so PostgreSQL) of this checkout, tauri-driver, an msedgedriver matching
// WebView2, and the seeded test account.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { belongsTo, owners } from "../../scripts/api-port.mjs";
import {
  driverVersion,
  e2eDir,
  major,
  webview2Version,
} from "./edge-driver.mjs";

const repoDir = join(e2eDir, "..");
const apiUrl = process.env.VITE_API_URL ?? "http://localhost:3000";
const isWindows = process.platform === "win32";

function fail(message) {
  console.error(`\n✖ E2E preflight: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoDir,
    stdio: "inherit",
    shell: isWindows,
    ...options,
  });
  return result.status ?? 1;
}

if (!isWindows)
  fail("the desktop smoke runs on Windows (WebView2 + msedgedriver).");

try {
  const res = await fetch(`${apiUrl}/health`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (err) {
  fail(
    `the API at ${apiUrl} is not answering (${err.message}). Start PostgreSQL and \`cd server && npm start\`.`,
  );
}

// An API left running by another checkout (a worktree, an earlier session)
// answers /health too, but serves other code: the smoke would test that one.
// `npm start` in this checkout stops it first (scripts/api-port.mjs).
const port = Number(new URL(apiUrl).port || 80);
const stale = owners(port).filter(
  (o) => o.pharos && !belongsTo(o.commandLine, repoDir),
);
if (stale.length > 0) {
  fail(
    `the API on port ${port} belongs to another checkout (PID ${stale[0].pid}: ${stale[0].commandLine}). Start this checkout's API with \`cd server && npm start\`; it stops the other one first.`,
  );
}

if (
  spawnSync(process.env.TAURI_DRIVER ?? "tauri-driver", ["--help"], {
    stdio: "ignore",
  }).error
) {
  fail(
    "tauri-driver not found. Install it with `cargo install tauri-driver --locked`.",
  );
}

const webview = webview2Version();
let driver = null;
try {
  driver = driverVersion(); // checks Microsoft's signature before running it
} catch (err) {
  fail(`${err.message} Run \`npm run e2e:driver\` to download it again.`);
}
if (!webview) fail("WebView2 runtime not found.");
if (!driver) fail("msedgedriver missing. Run `npm run e2e:driver`.");
if (major(driver) !== major(webview)) {
  fail(
    `msedgedriver ${driver} does not match WebView2 ${webview}. Run \`npm run e2e:driver\`.`,
  );
}

console.log("› Seeding the local test account (idempotent)");
if (run("npm", ["--prefix", "server", "run", "seed:test-user"]) !== 0) {
  fail(
    "`npm run seed:test-user` failed (is PostgreSQL up and `.env` correct?).",
  );
}

if (!process.env.E2E_SKIP_BUILD) {
  console.log("› Building the debug binary (tauri build --debug --no-bundle)");
  if (run("npx", ["tauri", "build", "--debug", "--no-bundle"]) !== 0)
    fail("the debug build failed.");
}

console.log("› Running the smoke with WebdriverIO");
process.exit(run("npx", ["wdio", "run", "e2e/wdio.conf.ts"]));
