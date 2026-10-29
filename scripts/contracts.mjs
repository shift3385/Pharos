// Generated TS contracts (BASE-05, ADR-0026). The Rust types that cross the
// Tauri boundary or the sync wire derive `ts_rs::TS` in tests, and `cargo test`
// writes them to src/shared/contracts/generated/ (settings in
// src-tauri/.cargo/config.toml). This script keeps that folder honest:
//
//   node scripts/contracts.mjs clean     empty the folder (before cargo test,
//                                        so a type removed from Rust leaves no
//                                        stale file behind)
//   node scripts/contracts.mjs check     fail if the folder differs from what
//                                        is committed (after cargo test), or
//                                        if the barrel (contract.ts) misses a
//                                        generated type
//   node scripts/contracts.mjs generate  clean + run only the export tests
//
// CI (job `rust`) runs `clean`, then `cargo test`, then `check`.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const GENERATED = "src/shared/contracts/generated";
export const BARREL = "src/shared/contracts/contract.ts";

/** Generated types the barrel does not re-export, and barrel lines whose file
 *  no longer exists. */
export function barrelGaps(files, barrel) {
  const listed = new Set([...barrel.matchAll(/from "\.\/generated\/([^"]+)"/g)].map((m) => m[1]));
  const types = files.filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3));
  return [
    ...types.filter((t) => !listed.has(t)).map((t) => `not exported by ${BARREL}: ${t}`),
    ...[...listed].filter((t) => !types.includes(t)).map((t) => `${BARREL} exports a missing type: ${t}`),
  ];
}

/** Lines of `git status --porcelain` that concern the generated folder, as
 *  readable problems. Untracked (`??`), modified and deleted all count. */
export function driftOf(porcelain) {
  return porcelain
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 3 && l.slice(3).startsWith(GENERATED))
    .map((l) => {
      const code = l.slice(0, 2).trim();
      const file = l.slice(3);
      if (code === "??") return `new (not committed): ${file}`;
      if (code.includes("D")) return `removed from Rust but still committed: ${file}`;
      return `differs from the Rust type: ${file}`;
    });
}

function clean() {
  rmSync(join(root, GENERATED), { recursive: true, force: true });
  mkdirSync(join(root, GENERATED), { recursive: true });
}

function check() {
  const porcelain = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", GENERATED],
    { cwd: root, encoding: "utf8" },
  );
  const problems = [
    ...driftOf(porcelain),
    ...barrelGaps(readdirSync(join(root, GENERATED)), readFileSync(join(root, BARREL), "utf8")),
  ];
  if (problems.length === 0) {
    console.log(`contracts: ${GENERATED} matches the Rust types`);
    return;
  }
  console.error(
    `contracts: the generated TS types differ from the committed ones (BASE-05):\n  ${problems.join("\n  ")}\n` +
      "Run `npm run contracts`, update the barrel if needed, and commit src/shared/contracts/.",
  );
  process.exit(1);
}

function generate() {
  clean();
  execFileSync("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml", "export_bindings"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];
  if (command === "clean") clean();
  else if (command === "check") check();
  else if (command === "generate") generate();
  else {
    console.error("usage: node scripts/contracts.mjs clean | check | generate");
    process.exit(2);
  }
}
