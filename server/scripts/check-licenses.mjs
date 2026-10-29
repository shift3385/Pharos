// License gate for the backend (spec §15): permissive licenses only; strong
// copyleft (GPL/AGPL/SSPL) is forbidden. Mirrors the client-side check.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modulesDir = join(root, "node_modules");

const FORBIDDEN = [/\bagpl/i, /\bgpl/i, /\bsspl/i, /\bcc-by-sa/i, /\beupl/i];
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
      yield* iterPackages(full);
      continue;
    }
    const pkgJson = join(full, "package.json");
    if (existsSync(pkgJson)) yield { name: entry, license: readLicense(pkgJson) };
    yield* iterPackages(join(full, "node_modules"));
  }
}

if (!existsSync(modulesDir)) {
  console.error("node_modules not found — run `npm install` first.");
  process.exit(1);
}

// Weak copyleft is accepted only for packages named in the repository's
// scripts/license-exceptions.json (shared with the client gate, ADR-0021).
const exceptionsFile = join(root, "..", "scripts", "license-exceptions.json");
const exceptions = existsSync(exceptionsFile)
  ? JSON.parse(readFileSync(exceptionsFile, "utf8")).npm
  : {};

const forbidden = [];
const excepted = [];
let checked = 0;
for (const { name, license } of iterPackages(modulesDir)) {
  checked += 1;
  if (!license) continue;
  if (FORBIDDEN.some((re) => re.test(license))) forbidden.push(`${name}: ${license}`);
  else if (WARN.some((re) => re.test(license))) {
    if (exceptions[name]?.license === license) excepted.push(`${name}: ${license}`);
    else
      forbidden.push(
        `${name}: ${license} (weak copyleft not listed in scripts/license-exceptions.json)`,
      );
  }
}

console.log(`Checked ${checked} installed packages.`);
if (excepted.length) {
  console.warn("\nWeak-copyleft accepted by name (scripts/license-exceptions.json):");
  excepted.forEach((w) => console.warn(`  - ${w}`));
}
if (forbidden.length) {
  console.error(
    "\nFORBIDDEN licenses detected (GPL/AGPL/SSPL, or unlisted weak copyleft — spec §15):",
  );
  forbidden.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log("License check passed: no forbidden copyleft licenses.");
