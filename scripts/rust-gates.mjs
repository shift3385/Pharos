// Rust quality gates for CI (BASE-01): `cargo fmt --check` and
// `cargo clippy --all-targets -- -D warnings`, except for the exact
// (file) / (file, lint) pairs listed in rust-gates.allowlist.json. Those belong
// to tracks that are still changing the files; once they merge, their entries
// are removed and the gates become plain `cargo fmt --check` / `-D warnings`.
//
//   node scripts/rust-gates.mjs fmt
//   node scripts/rust-gates.mjs clippy
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const crateDir = join(root, "src-tauri");

/** Repo-relative path with forward slashes ("src-tauri/src/sync.rs"). */
export function toRepoPath(file, base = crateDir) {
  const cleaned = file.replace(/^\\\\\?\\/, ""); // Windows verbatim prefix
  const abs = /^([a-zA-Z]:)?[\\/]/.test(cleaned)
    ? cleaned
    : join(base, cleaned);
  return relative(root, abs).split("\\").join("/");
}

/** Splits files reported by `cargo fmt --check --message-format short`. */
export function judgeFmt(files, allowlist) {
  const allowed = new Set(allowlist.map((e) => e.file));
  const failing = files.filter((f) => !allowed.has(f));
  const tolerated = files.filter((f) => allowed.has(f));
  const stale = [...allowed].filter((f) => !files.includes(f));
  return { failing, tolerated, stale };
}

/**
 * Reads `cargo clippy --message-format=json` output (one JSON object per line)
 * and returns the warnings/errors raised in this crate, de-duplicated (the lib
 * and the lib-test targets report the same lint twice).
 */
export function parseClippy(stdout) {
  const seen = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.reason !== "compiler-message") continue;
    const m = msg.message;
    if (!["warning", "error"].includes(m.level)) continue;
    const span = m.spans?.find((s) => s.is_primary);
    if (!span) continue; // summaries such as "N warnings emitted"
    const file = toRepoPath(span.file_name);
    const lint = m.code?.code ?? "";
    const key = `${file}:${span.line_start}:${lint}`;
    if (!seen.has(key)) {
      seen.set(key, {
        file,
        line: span.line_start,
        lint,
        level: m.level,
        rendered: m.rendered ?? m.message,
      });
    }
  }
  return [...seen.values()];
}

/** Splits clippy diagnostics into failing / tolerated, and finds stale entries. */
export function judgeClippy(diagnostics, allowlist) {
  const isAllowed = (d) =>
    allowlist.some((e) => e.file === d.file && e.lint === d.lint);
  const failing = diagnostics.filter((d) => !isAllowed(d));
  const tolerated = diagnostics.filter(isAllowed);
  const stale = allowlist.filter(
    (e) => !diagnostics.some((d) => d.file === e.file && d.lint === e.lint),
  );
  return { failing, tolerated, stale };
}

function run(args) {
  return spawnSync("cargo", args, {
    cwd: crateDir,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    shell: process.platform === "win32",
  });
}

function report(name, { failing, tolerated, stale }, show) {
  for (const t of tolerated) console.warn(`tolerated (allowlist): ${show(t)}`);
  for (const s of stale) {
    console.warn(
      `stale allowlist entry, remove it from scripts/rust-gates.allowlist.json: ${JSON.stringify(s)}`,
    );
  }
  if (failing.length) {
    console.error(`\n${name} gate FAILED:`);
    for (const f of failing)
      console.error(typeof f === "string" ? `  - ${f}` : f.rendered);
    return 1;
  }
  console.log(`${name} gate passed (${tolerated.length} tolerated).`);
  return 0;
}

function main(gate) {
  const allowlist = JSON.parse(
    readFileSync(join(root, "scripts", "rust-gates.allowlist.json"), "utf8"),
  );
  if (gate === "fmt") {
    const res = run(["fmt", "--check", "--message-format", "short"]);
    if (res.status !== 0 && !res.stdout.trim()) {
      console.error(res.stderr);
      return 1;
    }
    const files = res.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((f) => toRepoPath(f));
    return report("rustfmt", judgeFmt(files, allowlist.fmt), (f) => f);
  }
  if (gate === "clippy") {
    const res = run([
      "clippy",
      "--all-targets",
      "--locked",
      "--message-format=json",
    ]);
    const diagnostics = parseClippy(res.stdout);
    if (res.status !== 0 && !diagnostics.some((d) => d.level === "error")) {
      console.error(res.stderr);
      return 1;
    }
    return report(
      "clippy",
      judgeClippy(diagnostics, allowlist.clippy),
      (d) => `${d.file}:${d.line} ${d.lint}`,
    );
  }
  console.error("usage: node scripts/rust-gates.mjs <fmt|clippy>");
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv[2]));
}
