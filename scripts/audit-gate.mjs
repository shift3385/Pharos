// npm dependency audit gate (BASE-03). Runs `npm audit --json` for the client
// (repo root) and the backend (server/) and fails on any high or critical
// advisory that is not tolerated in scripts/audit-allowlist.json, or whose
// tolerance has expired. Moderate and low advisories are only reported.
//
//   node scripts/audit-gate.mjs            # root and server
//   node scripts/audit-gate.mjs server     # one scope
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPES = { root: root, server: join(root, "server") };
const BLOCKING = new Set(["high", "critical"]);

/** Unique advisories (GHSA id, package, severity, title) in an npm audit report. */
export function advisories(report) {
  const found = new Map();
  for (const vuln of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vuln.via) {
      if (typeof via !== "object") continue; // inherited from another package
      const id = String(via.url ?? via.source)
        .split("/")
        .pop();
      if (!found.has(id)) {
        found.set(id, {
          id,
          package: via.name,
          severity: via.severity,
          title: via.title,
        });
      }
    }
  }
  return [...found.values()];
}

/** Splits advisories into blocking / tolerated / reported, plus stale entries. */
export function judgeAudit(found, allowlist, scope, today) {
  const entries = allowlist.filter((e) => e.scope === scope);
  const entryFor = (a) => entries.find((e) => e.id === a.id);
  const blocking = [];
  const tolerated = [];
  const reported = [];
  for (const a of found) {
    if (!BLOCKING.has(a.severity)) {
      reported.push(a);
      continue;
    }
    const entry = entryFor(a);
    if (!entry) blocking.push(a);
    else if (entry.expires < today)
      blocking.push({ ...a, expired: entry.expires });
    else tolerated.push({ ...a, entry });
  }
  const stale = entries.filter((e) => !found.some((a) => a.id === e.id));
  return { blocking, tolerated, reported, stale };
}

function audit(dir) {
  const res = spawnSync("npm", ["audit", "--json"], {
    cwd: dir,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    return JSON.parse(res.stdout);
  } catch {
    throw new Error(`npm audit failed in ${dir}:\n${res.stderr}`);
  }
}

function main(only) {
  const { advisories: allowlist } = JSON.parse(
    readFileSync(join(root, "scripts", "audit-allowlist.json"), "utf8"),
  );
  const today = new Date().toISOString().slice(0, 10);
  let failed = false;
  for (const [scope, dir] of Object.entries(SCOPES)) {
    if (only && only !== scope) continue;
    const { blocking, tolerated, reported, stale } = judgeAudit(
      advisories(audit(dir)),
      allowlist,
      scope,
      today,
    );
    console.log(
      `\n[${scope}] ${blocking.length} blocking, ${tolerated.length} tolerated, ${reported.length} moderate/low`,
    );
    for (const a of reported)
      console.log(`  · ${a.severity} ${a.package}: ${a.title} (${a.id})`);
    for (const a of tolerated)
      console.warn(
        `  ~ tolerated until ${a.entry.expires} (${a.entry.item}): ${a.severity} ${a.package} ${a.id}`,
      );
    for (const e of stale)
      console.warn(
        `  ! stale allowlist entry, remove it: ${e.id} (${e.package})`,
      );
    for (const a of blocking) {
      const why = a.expired ? ` — tolerance expired on ${a.expired}` : "";
      console.error(
        `  ✗ ${a.severity} ${a.package}: ${a.title} (${a.id})${why}`,
      );
    }
    if (blocking.length) failed = true;
  }
  if (failed) {
    console.error(
      "\nAudit gate FAILED: fix (npm audit fix / upgrade) or document a temporary exception in scripts/audit-allowlist.json.",
    );
    return 1;
  }
  console.log("\nAudit gate passed: no untolerated high/critical advisories.");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv[2]));
}
