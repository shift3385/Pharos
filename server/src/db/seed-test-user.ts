// Creates the local development test account documented in the README, so a
// fresh or reset database can be signed into without registering by hand.
// Idempotent: an existing account is left untouched. Refuses to run with
// NODE_ENV=production. Override the values with TEST_USER_EMAIL / TEST_USER_PASSWORD.
import { env } from "../config/env";
import { createPool } from "./pool";
import { runMigrations } from "./migrate";
import { createAuthRepository } from "../modules/auth/auth.repository";
import { hashPassword } from "../modules/auth/password";

const TEST_USER = {
  email: (process.env.TEST_USER_EMAIL ?? "smoke@pharos.dev").toLowerCase(),
  password: process.env.TEST_USER_PASSWORD ?? "supersecret1",
  display_name: "Smoke",
  first_name: "Smoke",
  last_name: "Tester",
};

if (env.NODE_ENV === "production") {
  console.error("Refusing to seed a test account with NODE_ENV=production.");
  process.exit(1);
}

const pool = createPool(env.DATABASE_URL);
try {
  await runMigrations(pool);
  const repo = createAuthRepository(pool);
  if (await repo.findByEmail(TEST_USER.email)) {
    console.log(`Test account ${TEST_USER.email} already exists; nothing to do.`);
  } else {
    const { password, ...profile } = TEST_USER;
    await repo.createUser({ ...profile, password_hash: await hashPassword(password) });
    console.log(`Created test account ${TEST_USER.email} (credentials in README.md).`);
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
