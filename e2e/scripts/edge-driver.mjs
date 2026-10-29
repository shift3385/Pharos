// Helpers shared by the E2E scripts: the installed WebView2 runtime version and
// the Microsoft Edge WebDriver (msedgedriver) that must match it. tauri-driver
// drives the Pharos window through msedgedriver, which refuses to attach to a
// WebView2 of a different major version.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const e2eDir = join(dirname(fileURLToPath(import.meta.url)), "..");
export const binDir = join(e2eDir, ".bin");
export const driverPath = join(binDir, "msedgedriver.exe");

// WebView2 Evergreen runtime client id (same on every Windows machine).
const WEBVIEW2_CLIENT = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
const REGISTRY_KEYS = [
  `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_CLIENT}`,
  `HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_CLIENT}`,
  `HKCU\\Software\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_CLIENT}`,
];

/** Version of the installed WebView2 runtime (e.g. "156.0.4314.50"), or null. */
export function webview2Version() {
  for (const key of REGISTRY_KEYS) {
    try {
      const out = execFileSync("reg", ["query", key, "/v", "pv"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const match = out.match(/pv\s+REG_SZ\s+([\d.]+)/);
      if (match && match[1] !== "0.0.0.0") return match[1];
    } catch {
      // Key absent: try the next location.
    }
  }
  return null;
}

// Supply chain (ADR-0021): msedgedriver is a downloaded executable, so it must
// carry a valid Authenticode signature from Microsoft before anything runs it.
const MICROSOFT_SIGNER = /^CN=Microsoft Corporation,/;

/** True for a valid Authenticode signature whose signer is Microsoft. */
export function isMicrosoftSigned(status, subject) {
  return status === "Valid" && MICROSOFT_SIGNER.test(subject ?? "");
}

/**
 * Authenticode status and signer subject of `path`, from Windows PowerShell.
 * Its environment drops `PSModulePath`: one inherited from PowerShell 7 (a
 * CI step's shell) makes Windows PowerShell load 7's
 * Microsoft.PowerShell.Security, which fails, and the file looks unsigned.
 */
function authenticode(path) {
  const script =
    "$s = Get-AuthenticodeSignature -LiteralPath $env:PHAROS_SIGNED_FILE; " +
    '"$($s.Status)|$($s.SignerCertificate.Subject)"';
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => name.toUpperCase() !== "PSMODULEPATH",
    ),
  );
  const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    env: { ...env, PHAROS_SIGNED_FILE: path },
  }).trim();
  const [status, subject = ""] = out.split("|");
  return { status, subject };
}

/** Throws unless `path` is signed by Microsoft. */
export function assertMicrosoftSigned(path) {
  const { status, subject } = authenticode(path);
  if (!isMicrosoftSigned(status, subject)) {
    throw new Error(
      `${path} is not signed by Microsoft (signature: ${status || "none"}${subject ? `, signer: ${subject}` : ""}).`,
    );
  }
}

/**
 * Version of the msedgedriver in e2e/.bin, or null if it is missing. Throws if
 * the file is not signed by Microsoft: it is never run in that case.
 */
export function driverVersion() {
  if (!existsSync(driverPath)) return null;
  assertMicrosoftSigned(driverPath);
  const out = execFileSync(driverPath, ["--version"], { encoding: "utf8" });
  return out.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1] ?? null;
}

export const major = (version) => version?.split(".")[0] ?? null;
