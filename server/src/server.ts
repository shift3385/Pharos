import { env, startupWarnings } from "./config/env";
import { createPool } from "./db/pool";
import { runMigrations } from "./db/migrate";
import { buildApp } from "./app";
import { createSyncRepository } from "./modules/sync/sync.repository";

/** How often old tombstones are cleared (SYNC-06): once at start, then daily. */
const COMPACT_EVERY_MS = 24 * 60 * 60 * 1000;

for (const warning of startupWarnings(env)) console.warn(`Warning: ${warning}`);

const pool = createPool(env.DATABASE_URL);

try {
  const ran = await runMigrations(pool);
  if (ran.length > 0) {
    console.log(`Applied ${ran.length} migration(s): ${ran.join(", ")}`);
  }
  const app = buildApp({ pool, env });

  let timer: NodeJS.Timeout | undefined;
  app.addHook("onClose", async () => clearInterval(timer));
  await app.listen({ host: env.HOST, port: env.PORT });

  if (env.SYNC_TOMBSTONE_DAYS > 0) {
    const repo = createSyncRepository(pool);
    const compact = () =>
      repo
        .compactTombstones(env.SYNC_TOMBSTONE_DAYS)
        .then((n) => {
          if (n > 0) app.log.info(`Cleared the content of ${n} old tombstone(s)`);
        })
        .catch((error: unknown) => app.log.error({ err: error }, "Tombstone compaction failed"));
    void compact();
    timer = setInterval(() => void compact(), COMPACT_EVERY_MS);
    timer.unref();
  }
} catch (error) {
  console.error("Failed to start Pharos API:", error);
  await pool.end();
  process.exit(1);
}
