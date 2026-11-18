// Downloads the Microsoft Edge WebDriver that matches the installed WebView2
// runtime into e2e/.bin (git-ignored), from Microsoft's official host only.
// The binary must carry a valid Authenticode signature from Microsoft before
// it is run, also when it is already there (ADR-0021).
//
//   npm run e2e:driver
//
// Re-run it whenever WebView2 updates itself and the smoke reports a mismatch.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  binDir,
  driverPath,
  driverVersion,
  webview2Version,
} from "./edge-driver.mjs";

const HOST = "https://msedgedriver.microsoft.com";

const version = webview2Version();
if (!version) {
  console.error(
    "WebView2 runtime not found in the registry. Install it first.",
  );
  process.exit(1);
}
try {
  if (driverVersion() === version) {
    console.log(`msedgedriver ${version} already in ${binDir}`);
    process.exit(0);
  }
} catch (err) {
  // Not signed by Microsoft: replace it.
  console.warn(`${err.message} Downloading it again.`);
  rmSync(driverPath, { force: true });
}

// curl.exe ships with Windows 10+ and retries a dropped connection, which
// Node's fetch does not (the host is slow and sometimes resets).
// Plain --retry skips connection errors such as "(55) Send failure: Connection
// was aborted", which broke a CI run; --retry-all-errors retries those too.
mkdirSync(binDir, { recursive: true });
const zipPath = join(binDir, "edgedriver_win64.zip");
const url = `${HOST}/${version}/edgedriver_win64.zip`;
try {
  execFileSync(
    "curl.exe",
    ["-fsSL", "--retry", "5", "--retry-all-errors", "--retry-delay", "3", "-o", zipPath, url],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
} catch {
  console.error(`msedgedriver ${version} could not be downloaded from ${url}`);
  process.exit(1);
}
console.log(`Downloaded ${url}`);

rmSync(driverPath, { force: true });
// Windows' own bsdtar (System32, not Git's GNU tar on PATH) unzips it.
// Expand-Archive broke on the CI runner image («Cannot find an overload for
// "ExtractToDirectory"») and left no driver behind (BASE-24).
const tar = join(process.env.SystemRoot ?? "C:/Windows", "System32", "tar.exe");
try {
  execFileSync(tar, ["-xf", zipPath, "-C", binDir], { stdio: "inherit" });
} catch {
  console.error(`msedgedriver ${version} could not be extracted from ${zipPath}`);
  process.exit(1);
}
rmSync(zipPath, { force: true });
let ready;
try {
  ready = driverVersion();
} catch (err) {
  rmSync(driverPath, { force: true });
  console.error(`${err.message} It was deleted.`);
  process.exit(1);
}
if (!ready) {
  console.error(`msedgedriver is not in ${binDir} after extracting ${url}`);
  process.exit(1);
}
console.log(`msedgedriver ${ready} ready in ${binDir}`);
