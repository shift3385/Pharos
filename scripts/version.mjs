// Version gate (docs/VERSIONING.md): the root package.json is the single source
// of truth for the Pharos version; every other manifest must carry the same
// SemVer string so the app, the backend and the installer never disagree.
//
//   node scripts/version.mjs check          exit non-zero on any mismatch
//   node scripts/version.mjs set <version>  write <version> everywhere
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// SemVer 2.0.0 (https://semver.org), without build metadata.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

// Text-level replacements keep each file's own formatting intact.
const jsonVersion = /("version":\s*")([^"]*)(")/;
const tomlPackageVersion = /(\[package\][^[]*?\r?\nversion = ")([^"]*)(")/;
const lockPharosVersion = /(\r?\nname = "pharos"\r?\nversion = ")([^"]*)(")/;

// Each target: a file and how to read/write its version. Lockfiles hold the
// root package version twice (top level and packages[""]).
const TARGETS = [
  { file: "package.json", patterns: [jsonVersion] },
  { file: "package-lock.json", patterns: [jsonVersion, jsonVersion], lock: true },
  { file: "server/package.json", patterns: [jsonVersion] },
  { file: "server/package-lock.json", patterns: [jsonVersion, jsonVersion], lock: true },
  { file: "src-tauri/tauri.conf.json", patterns: [jsonVersion] },
  { file: "src-tauri/Cargo.toml", patterns: [tomlPackageVersion] },
  { file: "src-tauri/Cargo.lock", patterns: [lockPharosVersion] },
];

function read(file) {
  return readFileSync(join(root, file), "utf8");
}

// Versions found in a file, in pattern order. For lockfiles the second match
// is searched after the first, inside the packages[""] entry.
function versionsOf(target) {
  const text = read(target.file);
  if (!target.lock) return target.patterns.map((p) => text.match(p)?.[2] ?? null);
  const top = text.match(jsonVersion);
  const rootEntry = text.indexOf('"": {');
  const inner = rootEntry >= 0 ? text.slice(rootEntry).match(jsonVersion) : null;
  return [top?.[2] ?? null, inner?.[2] ?? null];
}

function writeVersion(target, version) {
  let text = read(target.file);
  if (target.lock) {
    text = text.replace(jsonVersion, `$1${version}$3`);
    const rootEntry = text.indexOf('"": {');
    text =
      text.slice(0, rootEntry) + text.slice(rootEntry).replace(jsonVersion, `$1${version}$3`);
  } else {
    for (const p of target.patterns) text = text.replace(p, `$1${version}$3`);
  }
  writeFileSync(join(root, target.file), text);
}

const [command, arg] = process.argv.slice(2);

if (command === "check") {
  const expected = versionsOf(TARGETS[0])[0];
  let ok = SEMVER.test(expected ?? "");
  if (!ok) console.error(`package.json version "${expected}" is not valid SemVer.`);
  for (const target of TARGETS) {
    for (const found of versionsOf(target)) {
      if (found !== expected) {
        ok = false;
        console.error(`${target.file}: version "${found}" ≠ package.json "${expected}"`);
      }
    }
  }
  if (!ok) {
    console.error("\nRun: node scripts/version.mjs set <version>  (see docs/VERSIONING.md)");
    process.exit(1);
  }
  console.log(`Version check passed: ${expected} in all ${TARGETS.length} manifests.`);
} else if (command === "set") {
  if (!arg || !SEMVER.test(arg)) {
    console.error(`"${arg ?? ""}" is not a valid SemVer version (e.g. 0.2.0, 0.2.0-alpha.1).`);
    process.exit(1);
  }
  for (const target of TARGETS) writeVersion(target, arg);
  console.log(`Version set to ${arg} in ${TARGETS.length} manifests.`);
} else {
  console.error("Usage: node scripts/version.mjs check | set <version>");
  process.exit(1);
}
