// Keeps the API port free for the API you are starting. An API left running by
// an earlier session (or another worktree) keeps listening on the port: the new
// one cannot start, and the desktop app (whose CSP only allows the API at
// localhost:3000) and the E2E smoke talk to the stale one instead.
//
//   node scripts/api-port.mjs free    (server `prestart`/`predev`)
//   node scripts/api-port.mjs owner   (prints who listens on the port)
//
// The E2E preflight (e2e/scripts/run-smoke.mjs) uses `owners` and `belongsTo`
// to refuse an API that belongs to another checkout.
//
// `free` stops the listener only when it is a Pharos API (any checkout); any
// other program is left alone and reported, and the start fails. The port is
// PORT from the environment or the repo `.env`, default 3000.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

/** PORT from the environment, else from `.env` text, else 3000. */
export function apiPort(env = process.env, dotenv = readDotenv()) {
  const raw = env.PORT ?? /^\s*PORT\s*=\s*(\d+)\s*$/m.exec(dotenv)?.[1];
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 ? port : 3000;
}

function readDotenv() {
  try {
    return readFileSync(join(root, ".env"), "utf8");
  } catch {
    return "";
  }
}

const slashes = (s) => s.replace(/\\/g, "/").toLowerCase();

/** The Pharos API runs as `tsx src/server.ts` from a checkout whose path
 *  contains "pharos" (the main checkout or a `.claude/worktrees/*` one), or
 *  from this checkout whatever its folder is called. */
export function isPharosApi(commandLine, repoDir = root) {
  if (!commandLine) return false;
  const cmd = slashes(commandLine);
  if (!/(^|[\s/"'])src\/server\.ts\b/.test(cmd)) return false;
  return cmd.includes("pharos") || belongsTo(commandLine, repoDir);
}

/** Whether an API command line runs from `repoDir`'s own `server/` folder. A
 *  worktree lives under the main checkout, so the main checkout's path alone
 *  would also match every worktree: compare `<repo>/server/node_modules`. */
export function belongsTo(commandLine, repoDir = root) {
  return slashes(commandLine ?? "").includes(
    `${slashes(repoDir).replace(/\/$/, "")}/server/node_modules`,
  );
}

/** PIDs listening on `port` in `netstat -ano` output (Windows). */
export function parseNetstat(text, port) {
  const pids = new Set();
  for (const line of text.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols[0] !== "TCP" || cols[3] !== "LISTENING") continue;
    const local = cols[1];
    if (local.slice(local.lastIndexOf(":") + 1) === String(port)) {
      pids.add(Number(cols[4]));
    }
  }
  return [...pids].filter((pid) => pid > 0);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true });
  return r.error ? "" : (r.stdout ?? "");
}

function listeners(port) {
  if (isWindows)
    return parseNetstat(run("netstat", ["-ano", "-p", "TCP"]), port);
  return run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
    .split(/\s+/)
    .map(Number)
    .filter((pid) => pid > 0);
}

function commandLine(pid) {
  if (isWindows) {
    return run("powershell.exe", [
      "-NoProfile",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
    ]).trim();
  }
  return run("ps", ["-o", "command=", "-p", String(pid)]).trim();
}

function stop(pid) {
  if (isWindows) run("taskkill", ["/PID", String(pid), "/T", "/F"]);
  else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Who listens on `port`: `[{ pid, commandLine, pharos }]`. */
export function owners(port) {
  return listeners(port).map((pid) => {
    const cmd = commandLine(pid);
    return { pid, commandLine: cmd, pharos: isPharosApi(cmd) };
  });
}

/** Frees `port` from stale Pharos APIs. Returns an error message when another
 *  program holds it, or when a Pharos API would not stop. */
export async function freePort(port, log = console.log) {
  const found = owners(port);
  const foreign = found.filter((o) => !o.pharos);
  if (foreign.length > 0) {
    const who = foreign
      .map((o) => `PID ${o.pid}: ${o.commandLine || "(unknown)"}`)
      .join("; ");
    return `port ${port} is used by another program (${who}). It is not a Pharos API, so it was not stopped: close it or set PORT.`;
  }
  for (const o of found) {
    log(
      `› Stopping an earlier Pharos API on port ${port} (PID ${o.pid}): ${o.commandLine}`,
    );
    stop(o.pid);
  }
  for (let i = 0; found.length > 0 && i < 20; i++) {
    if (listeners(port).length === 0) return null;
    await sleep(250);
  }
  return listeners(port).length === 0
    ? null
    : `port ${port} is still in use after stopping the earlier Pharos API.`;
}

async function main(command) {
  const port = apiPort();
  if (command === "owner") {
    const found = owners(port);
    if (found.length === 0) console.log(`Port ${port} is free.`);
    for (const o of found) {
      console.log(
        `PID ${o.pid} (${o.pharos ? "Pharos API" : "other program"}): ${o.commandLine}`,
      );
    }
    return 0;
  }
  if (command === "free") {
    const error = await freePort(port);
    if (error) {
      console.error(`✖ ${error}`);
      return 1;
    }
    return 0;
  }
  console.error("usage: node scripts/api-port.mjs free|owner");
  return 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(await main(process.argv[2]));
}
