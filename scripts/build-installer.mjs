// Builds the Windows installer (BASE-09, docs/VERSIONING.md §5).
//
// Tauri's WiX (MSI) bundler only accepts a numeric pre-release (0.1.0-1) and
// rejects SemVer pre-releases such as 0.1.0-alpha.1. So alphas, betas and RCs
// ship the NSIS installer only, and stable versions ship NSIS + MSI.
// tauri.conf.json lists only "nsis", so a plain `tauri build` never fails on it.
//
// The installer also ships the command line (INT-01 L5, ADR-0054 §4): the
// `pharos-cli` crate is built first and staged as src-tauri/bin/pharos.exe,
// and tauri.installer.conf.json (merged with --config) lists it as a resource
// and adds the NSIS hooks that put it on the user's PATH. It is not in
// tauri.conf.json because tauri-build copies resources on every cargo build,
// which would then fail without a staged CLI.
//
//   npm run build:installer            # extra args go to `tauri build`, e.g. -- --ci
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
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

/** The config merged into tauri.conf.json for an installer build. */
export const INSTALLER_CONFIG = "src-tauri/tauri.installer.conf.json";
/** Where the CLI is staged, relative to src-tauri (the resource source). */
export const STAGED_CLI = "bin/pharos.exe";

/** The CLI binary Cargo writes for a release build in `targetDir`. */
export function cliBinary(targetDir, platform = process.platform) {
  return join(targetDir, "release", platform === "win32" ? "pharos-cli.exe" : "pharos-cli");
}

/** Builds the CLI (release) and stages it for the installer. */
function stageCli() {
  const tauriDir = join(root, "src-tauri");
  const build = spawnSync("cargo", ["build", "--release", "--locked", "-p", "pharos-cli"], {
    cwd: tauriDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (build.status !== 0) return build.status ?? 1;
  // The target folder as Cargo resolves it (CARGO_TARGET_DIR, a local
  // .cargo/config.toml, or src-tauri/target).
  const meta = spawnSync("cargo", ["metadata", "--format-version", "1", "--no-deps"], {
    cwd: tauriDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  if (meta.status !== 0) {
    console.error(meta.stderr);
    return meta.status ?? 1;
  }
  const { target_directory } = JSON.parse(meta.stdout);
  const staged = join(tauriDir, STAGED_CLI);
  mkdirSync(dirname(staged), { recursive: true });
  copyFileSync(cliBinary(target_directory), staged);
  console.log(`CLI staged: ${staged}`);
  return 0;
}

function main(extra) {
  const { version } = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  const bundles = bundlesFor(version);
  console.log(
    `Pharos ${version}: building ${bundles.join(" + ")} installer(s)`,
  );
  const staged = stageCli();
  if (staged !== 0) return staged;
  const res = spawnSync(
    "npx",
    [
      "tauri",
      "build",
      "--bundles",
      bundles.join(","),
      "--config",
      INSTALLER_CONFIG,
      ...extra,
    ],
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
