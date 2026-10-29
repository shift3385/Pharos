// Builds the Windows installer (BASE-09, docs/VERSIONING.md §5).
//
// Tauri's WiX (MSI) bundler only accepts a numeric pre-release (0.1.0-1) and
// rejects SemVer pre-releases such as 0.1.0-alpha.1. So alphas, betas and RCs
// ship the NSIS installer only, and stable versions ship NSIS + MSI.
// tauri.conf.json lists only "nsis", so a plain `tauri build` never fails on it.
//
//   npm run build:installer            # extra args go to `tauri build`, e.g. -- --ci
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** Installer formats for a version: NSIS always, MSI only for stable ones. */
export function bundlesFor(version) {
  const m = SEMVER.exec(version);
  if (!m) throw new Error(`"${version}" is not a SemVer version`);
  const [, major, minor, patch, pre] = m;
  if (pre) return ["nsis"];
  // Windows Installer product versions: major and minor ≤ 255, build ≤ 65535.
  if (Number(major) > 255 || Number(minor) > 255 || Number(patch) > 65535) {
    throw new Error(
      `${version} exceeds the MSI version limits (255.255.65535)`,
    );
  }
  return ["nsis", "msi"];
}

function main(extra) {
  const { version } = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  const bundles = bundlesFor(version);
  console.log(
    `Pharos ${version}: building ${bundles.join(" + ")} installer(s)`,
  );
  const res = spawnSync(
    "npx",
    ["tauri", "build", "--bundles", bundles.join(","), ...extra],
    {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  return res.status ?? 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(main(process.argv.slice(2)));
}
