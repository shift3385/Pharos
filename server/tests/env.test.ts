import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// env.ts validates process.env as soon as it is imported; give it a minimal
// valid development environment first (CI has no .env file).
process.env.DATABASE_URL ??= "postgres://user:pass@127.0.0.1:1/unused";
process.env.JWT_ACCESS_SECRET ??= "dev-only-secret-for-the-env-tests";
let loadEnv: typeof import("../src/config/env").loadEnv;
beforeAll(async () => {
  ({ loadEnv } = await import("../src/config/env"));
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
});
