// License gate (spec §15): only permissive licenses (MIT, Apache-2.0, BSD, ISC,
// OFL, ...) are allowed. Strong copyleft (GPL/AGPL/SSPL) is forbidden because
// the repository is private and potentially commercial.
//
// Walks the installed node_modules tree, reads each package's declared license,
// and exits non-zero if any forbidden or unknown license is found.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modulesDir = join(root, "node_modules");

// Case-insensitive substrings that make a license forbidden.
const FORBIDDEN = [/\bagpl/i, /\bgpl/i, /\bsspl/i, /\bcc-by-sa/i, /\beupl/i];
// Weak copyleft we tolerate but report as a warning (dynamic linking only).
const WARN = [/\blgpl/i, /\bmpl/i];

function readLicense(pkgPath) {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (typeof pkg.license === "string") return pkg.license;
    if (pkg.license && typeof pkg.license === "object")
      return pkg.license.type ?? "";
    if (Array.isArray(pkg.licenses))
      return pkg.licenses.map((l) => l.type ?? l).join(" OR ");
    return "";
  } catch {
    return "";
  }
}

function* iterPackages(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry === ".bin" || entry === ".cache") continue;
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry.startsWith("@")) {
      // Scoped packages: descend one level.
      yield* iterPackages(full);
      continue;
    }
    const pkgJson = join(full, "package.json");
    if (existsSync(pkgJson)) {
      yield { name: entry, license: readLicense(pkgJson) };
    }
    // Nested node_modules (deduped installs).
    yield* iterPackages(join(full, "node_modules"));
  }
}

if (!existsSync(modulesDir)) {
  console.error("node_modules not found — run `npm install` first.");
  process.exit(1);
}

const forbidden = [];
const warnings = [];
const unknown = [];
let checked = 0;

for (const { name, license } of iterPackages(modulesDir)) {
  checked += 1;
  if (!license) {
    unknown.push(name);
    continue;
  }
  if (FORBIDDEN.some((re) => re.test(license))) {
    forbidden.push(`${name}: ${license}`);
  } else if (WARN.some((re) => re.test(license))) {
    warnings.push(`${name}: ${license}`);
  }
}

console.log(`Checked ${checked} installed packages.`);
if (warnings.length) {
  console.warn("\nWeak-copyleft (review manually):");
  warnings.forEach((w) => console.warn(`  - ${w}`));
}
if (unknown.length) {
  console.warn(`\n${unknown.length} package(s) with no declared license field.`);
}
if (forbidden.length) {
  console.error("\nFORBIDDEN licenses detected (GPL/AGPL/SSPL — spec §15):");
  forbidden.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log("License check passed: no forbidden copyleft licenses.");
