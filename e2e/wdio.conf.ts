// WebdriverIO config for the desktop smoke (BASE-14). WDIO talks WebDriver to
// tauri-driver (:4444), which starts the real Pharos binary and drives its
// WebView2 through msedgedriver. Run it with `npm run e2e` (README → E2E).
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmdirSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const e2eDir = fileURLToPath(new URL(".", import.meta.url));
const repoDir = join(e2eDir, "..");
const resultsDir = join(e2eDir, "results");
const nativeDriver = join(e2eDir, ".bin", "msedgedriver.exe");
const DRIVER_PORT = 4444;
// Must match `identifier` in src-tauri/tauri.conf.json.
const APP_IDENTIFIER = "com.pharos.desktop";

// One isolated profile per run: the debug binary reads PHAROS_E2E_PROFILE
// (src-tauri/src/instance.rs) for its data dir, log dir and keychain entry, and
// WebView2 keeps its storage in WEBVIEW2_USER_DATA_FOLDER. Both variables are
// inherited by tauri-driver → msedgedriver → Pharos.
const runId = process.env.PHAROS_E2E_PROFILE ?? `smoke-${Date.now()}`;
process.env.PHAROS_E2E_PROFILE = runId;
const webviewDir = join(tmpdir(), `pharos-e2e-${runId}`);
process.env.WEBVIEW2_USER_DATA_FOLDER = webviewDir;

const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
const localAppData =
  process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
const profileDataDir = join(appData, APP_IDENTIFIER, "e2e", runId);
const profileLogDir = join(localAppData, APP_IDENTIFIER, "logs", "e2e", runId);

/** The debug binary, wherever Cargo's target dir is (it may be overridden). */
function appBinary(): string {
  if (process.env.PHAROS_E2E_APP) return process.env.PHAROS_E2E_APP;
  const metadata = JSON.parse(
    execFileSync(
      "cargo",
      [
        "metadata",
        "--format-version",
        "1",
        "--no-deps",
        "--manifest-path",
        join(repoDir, "src-tauri", "Cargo.toml"),
      ],
      { encoding: "utf8" },
    ),
  ) as { target_directory: string };
  return join(metadata.target_directory, "debug", "pharos.exe");
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = createConnection({ host: "127.0.0.1", port }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() > deadline)
          reject(new Error(`tauri-driver did not open port ${port}`));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

const application = appBinary();
let tauriDriver: ChildProcess | undefined;

export const config: WebdriverIO.Config = {
  runner: "local",
  hostname: "127.0.0.1",
  port: DRIVER_PORT,
  specs: ["./specs/**/*.e2e.ts"],
  maxInstances: 1,
  capabilities: [
    {
      // tauri-driver speaks classic WebDriver only (no BiDi).
      "wdio:enforceWebDriverClassic": true,
      "tauri:options": { application },
    } as WebdriverIO.Capabilities,
  ],
  logLevel: "warn",
  waitforTimeout: 15_000,
  connectionRetryCount: 0,
  framework: "mocha",
  mochaOpts: { ui: "bdd", timeout: 120_000 },
  reporters: [
    "spec",
    [
      "junit",
      {
        outputDir: resultsDir,
        outputFileFormat: (o) => `e2e-${o.cid}.junit.xml`,
      },
    ],
  ],

  onPrepare: async () => {
    if (!existsSync(application)) {
      throw new Error(
        `Pharos binary not found at ${application}. Run \`npm run e2e\` (it builds it).`,
      );
    }
    if (!existsSync(nativeDriver)) {
      throw new Error("msedgedriver missing. Run `npm run e2e:driver`.");
    }
    mkdirSync(resultsDir, { recursive: true });
    console.log(`E2E profile: ${runId}\nBinary: ${application}`);
    tauriDriver = spawn(
      process.env.TAURI_DRIVER ?? "tauri-driver",
      ["--native-driver", nativeDriver],
      {
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
    tauriDriver.on("error", (err) =>
      console.error(`tauri-driver failed to start: ${err.message}`),
    );
    await waitForPort(DRIVER_PORT, 15_000);
  },

  onComplete: () => {
    tauriDriver?.kill();
    // Keep the run's app logs as a CI artifact, then drop the profile.
    if (existsSync(profileLogDir)) {
      cpSync(profileLogDir, join(resultsDir, "app-logs"), { recursive: true });
    }
    for (const dir of [profileDataDir, profileLogDir, webviewDir]) {
      rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 500,
      });
    }
    // Drop the shared `e2e` parents too once no other run uses them.
    for (const dir of [profileDataDir, profileLogDir]) {
      try {
        rmdirSync(join(dir, ".."));
      } catch {
        // Not empty (another run) or already gone.
      }
    }
  },
};
