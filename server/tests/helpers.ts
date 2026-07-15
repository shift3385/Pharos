import dotenv from "dotenv";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { createPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { buildApp } from "../src/app";
import type { Env } from "../src/config/env";

dotenv.config({ path: "../.env" });
dotenv.config();

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5433/pharos_test_db";

const testEnv: Env = {
  NODE_ENV: "test",
  HOST: "0.0.0.0",
  PORT: 0,
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_ACCESS_SECRET: "test-secret-at-least-16-characters",
  ACCESS_TOKEN_TTL: "15m",
  REFRESH_TOKEN_TTL_DAYS: 30,
  CORS_ORIGIN: "*",
};

export async function setupTestApp(): Promise<{
  app: FastifyInstance;
  pool: Pool;
}> {
  const pool = createPool(TEST_DATABASE_URL);
  await runMigrations(pool);
  const app = buildApp({ pool, env: testEnv });
  await app.ready();
  return { app, pool };
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query("TRUNCATE refresh_tokens, users RESTART IDENTITY CASCADE");
}
