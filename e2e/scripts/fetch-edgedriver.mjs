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
mkdirSync(binDir, { recursive: true });
const zipPath = join(binDir, "edgedriver_win64.zip");
const url = `${HOST}/${version}/edgedriver_win64.zip`;
try {
  execFileSync("curl.exe", ["-fsSL", "--retry", "3", "-o", zipPath, url], {
    stdio: ["ignore", "inherit", "inherit"],
  });
} catch {
  console.error(`msedgedriver ${version} could not be downloaded from ${url}`);
  process.exit(1);
}
console.log(`Downloaded ${url}`);

rmSync(driverPath, { force: true });
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${binDir}' -Force`,
  ],
  { stdio: "inherit" },
);
rmSync(zipPath, { force: true });
try {
  console.log(`msedgedriver ${driverVersion()} ready in ${binDir}`);
} catch (err) {
  rmSync(driverPath, { force: true });
  console.error(`${err.message} It was deleted.`);
  process.exit(1);
}
