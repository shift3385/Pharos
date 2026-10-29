// Downloads the Microsoft Edge WebDriver that matches the installed WebView2
// runtime into e2e/.bin (git-ignored), from Microsoft's official host.
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

const HOSTS = [
  "https://msedgedriver.microsoft.com",
  "https://msedgedriver.azureedge.net",
];

const version = webview2Version();
if (!version) {
  console.error(
    "WebView2 runtime not found in the registry. Install it first.",
  );
  process.exit(1);
}
if (driverVersion() === version) {
  console.log(`msedgedriver ${version} already in ${binDir}`);
  process.exit(0);
}

// curl.exe ships with Windows 10+ and retries a dropped connection, which
// Node's fetch does not (the host is slow and sometimes resets).
mkdirSync(binDir, { recursive: true });
const zipPath = join(binDir, "edgedriver_win64.zip");
let downloaded = false;
for (const host of HOSTS) {
  const url = `${host}/${version}/edgedriver_win64.zip`;
  try {
    execFileSync("curl.exe", ["-fsSL", "--retry", "3", "-o", zipPath, url], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    console.log(`Downloaded ${url}`);
    downloaded = true;
    break;
  } catch {
    console.warn(`${url} could not be downloaded`);
  }
}
if (!downloaded) {
  console.error(`No msedgedriver ${version} could be downloaded.`);
  process.exit(1);
}

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
console.log(`msedgedriver ${driverVersion()} ready in ${binDir}`);
