import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// env.ts validates process.env as soon as it is imported; give it a minimal
// valid development environment first (CI has no .env file).
process.env.DATABASE_URL ??= "postgres://user:pass@127.0.0.1:1/unused";
process.env.JWT_ACCESS_SECRET ??= "dev-only-secret-for-the-env-tests";
type Config = typeof import("../src/config/env");
let loadEnv: Config["loadEnv"];
let parseDurationMs: Config["parseDurationMs"];
let startupWarnings: Config["startupWarnings"];
let publicUrlProblem: Config["publicUrlProblem"];
beforeAll(async () => {
  ({ loadEnv, parseDurationMs, startupWarnings, publicUrlProblem } =
    await import("../src/config/env"));
});

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const STRONG_SECRET = "f3Q9v1Zk8m2Lr7Xw0Tq5Hy4Bn6Cj9Pd2Gs";
const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://user:pass@db:5432/pharos",
  JWT_ACCESS_SECRET: STRONG_SECRET,
  CORS_ORIGIN: "https://pharos.example.com, http://tauri.localhost",
};

describe("environment (BASE-06)", () => {
  it("accepts a production config with a strong secret and explicit origins", () => {
    const env = loadEnv(production);
    expect(env.NODE_ENV).toBe("production");
    expect(env.LOGIN_RATE_LIMIT_MAX).toBe(10);
    expect(env.BODY_LIMIT_BYTES).toBe(1_048_576);
    expect(env.SYNC_BODY_LIMIT_BYTES).toBe(8_388_608);
    expect(env.TRUST_PROXY).toBe(false);
  });

  it("refuses the default secret from .env.example in production", () => {
    expect(() =>
      loadEnv({
        ...production,
        JWT_ACCESS_SECRET: "dev-insecure-secret-change-me-please-min32",
      }),
    ).toThrow(/JWT_ACCESS_SECRET: is a default\/placeholder value/);
  });

  it("refuses any placeholder-looking secret in production", () => {
    expect(() =>
      loadEnv({
        ...production,
        JWT_ACCESS_SECRET: `${STRONG_SECRET}-changeme`,
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("refuses a production secret shorter than 32 characters", () => {
    expect(() =>
      loadEnv({ ...production, JWT_ACCESS_SECRET: "a".repeat(31) }),
    ).toThrow(/JWT_ACCESS_SECRET: must be at least 32 characters/);
    expect(
      loadEnv({ ...production, JWT_ACCESS_SECRET: "a".repeat(32) })
        .JWT_ACCESS_SECRET,
    ).toHaveLength(32);
  });

  it('refuses CORS_ORIGIN="*" in production', () => {
    expect(() => loadEnv({ ...production, CORS_ORIGIN: "*" })).toThrow(
      /CORS_ORIGIN: must list the allowed origins explicitly/,
    );
    expect(() =>
      loadEnv({ ...production, CORS_ORIGIN: "https://a.example.com,*" }),
    ).toThrow(/CORS_ORIGIN/);
  });

  it("refuses CORS entries that are not origins", () => {
    for (const bad of [
      "https://pharos.example.com/",
      "https://pharos.example.com/app",
      "pharos.example.com",
      "ftp://pharos.example.com",
    ]) {
      expect(() => loadEnv({ ...production, CORS_ORIGIN: bad })).toThrow(
        /is not an origin/,
      );
    }
    expect(
      loadEnv({ ...production, CORS_ORIGIN: "tauri://localhost" }).CORS_ORIGIN,
    ).toBe("tauri://localhost");
  });

  it("keeps the permissive defaults outside production", () => {
    const env = loadEnv({
      NODE_ENV: "development",
      JWT_ACCESS_SECRET: "dev-insecure-secret-change-me-please-min32",
      CORS_ORIGIN: "*",
    });
    expect(env.CORS_ORIGIN).toBe("*");
  });

  it("parses TRUST_PROXY as a flag", () => {
    expect(loadEnv({ ...production, TRUST_PROXY: "true" }).TRUST_PROXY).toBe(
      true,
    );
    expect(loadEnv({ ...production, TRUST_PROXY: "0" }).TRUST_PROXY).toBe(
      false,
    );
    expect(() => loadEnv({ ...production, TRUST_PROXY: "yes" })).toThrow(
      /TRUST_PROXY/,
    );
  });

  it("the API process exits in production with the default secret and CORS *", () => {
    const tsxCli = join(serverDir, "node_modules", "tsx", "dist", "cli.mjs");
    const res = spawnSync(process.execPath, [tsxCli, "src/server.ts"], {
      cwd: serverDir,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: "postgres://user:pass@127.0.0.1:1/unused",
        JWT_ACCESS_SECRET: "dev-insecure-secret-change-me-please-min32",
        CORS_ORIGIN: "*",
      },
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Invalid environment configuration");
    expect(res.stderr).toContain("JWT_ACCESS_SECRET");
    expect(res.stderr).toContain("CORS_ORIGIN");
  });
  it("parses LOGIN_RATE_LIMIT_WINDOW as a duration and rejects nonsense", () => {
    expect(parseDurationMs("60000")).toBe(60_000);
    expect(parseDurationMs("30 seconds")).toBe(30_000);
    expect(parseDurationMs("1 minute")).toBe(60_000);
    expect(parseDurationMs("2h")).toBe(7_200_000);
    expect(parseDurationMs("0")).toBeNull();
    expect(parseDurationMs("soon")).toBeNull();
    expect(parseDurationMs("5 fortnights")).toBeNull();
    expect(loadEnv(production).LOGIN_RATE_LIMIT_WINDOW).toBe(60_000);
    // Unset, the default "1 minute" still goes through the parser (zod 4
    // `prefault`; a plain `default` would hand back the raw string).
    expect(
      loadEnv({ ...production, LOGIN_RATE_LIMIT_WINDOW: undefined })
        .LOGIN_RATE_LIMIT_WINDOW,
    ).toBe(60_000);
    expect(
      loadEnv({ ...production, LOGIN_RATE_LIMIT_WINDOW: "30 seconds" })
        .LOGIN_RATE_LIMIT_WINDOW,
    ).toBe(30_000);
    expect(() =>
      loadEnv({ ...production, LOGIN_RATE_LIMIT_WINDOW: "a while" }),
    ).toThrow(/LOGIN_RATE_LIMIT_WINDOW: "a while" is not a duration/);
  });

  it("warns when the API listens beyond loopback outside production", () => {
    const dev = (HOST: string) =>
      loadEnv({ NODE_ENV: "development", HOST, CORS_ORIGIN: "*" });
    expect(startupWarnings(dev("0.0.0.0"))[0]).toMatch(
      /NODE_ENV=development with HOST=0\.0\.0\.0: .*production checks .* are off/,
    );
    expect(startupWarnings(dev("127.0.0.1"))).toEqual([]);
    expect(startupWarnings(dev("localhost"))).toEqual([]);
    expect(startupWarnings(loadEnv(production))).toEqual([]);
  });

  it("requires SMTP_FROM and an https APP_PUBLIC_URL when SMTP is on (SEC-09)", () => {
    expect(publicUrlProblem("https://qa.example.com")).toBeNull();
    expect(publicUrlProblem("http://localhost:5173")).toBeNull();
    expect(publicUrlProblem("http://[::1]:5173")).toBeNull();
    expect(publicUrlProblem("http://qa.example.com")).toMatch(/https/);
    expect(publicUrlProblem("qa.example.com")).toMatch(/absolute/);
    expect(publicUrlProblem(undefined)).toMatch(/required/);
    expect(() =>
      loadEnv({
        SMTP_HOST: "smtp.example.com",
        APP_PUBLIC_URL: "http://qa.example.com",
      }),
    ).toThrow(/SMTP_FROM: is required[\s\S]*APP_PUBLIC_URL: .*must use https/);
    const on = loadEnv({
      SMTP_HOST: "smtp.example.com",
      SMTP_FROM: "Pharos <no-reply@example.com>",
      APP_PUBLIC_URL: "https://qa.example.com",
    });
    expect(on.SMTP_PORT).toBe(587);
    expect(on.RESET_TOKEN_TTL).toBe(1_800_000);
    // An empty value in a .env means "not set": email stays off.
    expect(
      loadEnv({ SMTP_HOST: "", APP_PUBLIC_URL: "" }).SMTP_HOST,
    ).toBeUndefined();
  });
});
