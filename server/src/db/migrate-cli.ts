import { env } from "../config/env";
import { createPool } from "./pool";
import { runMigrations } from "./migrate";

const pool = createPool(env.DATABASE_URL);
try {
  const ran = await runMigrations(pool);
  if (ran.length === 0) console.log("No pending migrations.");
  else console.log(`Applied migrations:\n${ran.map((r) => `  - ${r}`).join("\n")}`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
