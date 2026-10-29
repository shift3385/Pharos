import { env, startupWarnings } from "./config/env";
import { createPool } from "./db/pool";
import { runMigrations } from "./db/migrate";
import { buildApp } from "./app";

for (const warning of startupWarnings(env)) console.warn(`Warning: ${warning}`);

const pool = createPool(env.DATABASE_URL);

try {
  const ran = await runMigrations(pool);
  if (ran.length > 0) {
    console.log(`Applied ${ran.length} migration(s): ${ran.join(", ")}`);
  }
  const app = buildApp({ pool, env });
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  console.error("Failed to start Pharos API:", error);
  await pool.end();
  process.exit(1);
}
