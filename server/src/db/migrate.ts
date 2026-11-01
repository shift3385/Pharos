import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";
import { convertPlannerDefects } from "../modules/sync/defects";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

/** A data migration written in TypeScript (VERSIONING §6.1), run right
 *  after the SQL of the migration it is named after, in the same
 *  transaction: if it throws, that migration's SQL is rolled back too and
 *  the migration is not recorded. Each one is deterministic and idempotent.
 *  The twin of the desktop's `RUST_STEPS` (`src-tauri/src/db.rs`). */
export type DataStep = (client: PoolClient) => Promise<unknown>;

export const DATA_STEPS: Readonly<Record<string, DataStep>> = {
  // Planner defect cards become defect documents (DEF-01, ADR-0016).
  "0010_defects.sql": convertPlannerDefects,
};

/**
 * Minimal forward-only SQL migration runner. Applies every `*.sql` file in
 * `migrations/` in lexical order exactly once, tracked in `schema_migrations`.
 * Each file runs inside a transaction, with its data step (`DATA_STEPS`) if
 * it has one. `opts` is for tests: another folder or other data steps.
 */
export async function runMigrations(
  pool: Pool,
  opts: { dir?: string; dataSteps?: Readonly<Record<string, DataStep>> } = {},
): Promise<string[]> {
  const dir = opts.dir ?? migrationsDir;
  const steps = opts.dataSteps ?? DATA_STEPS;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query<{ name: string }>("SELECT name FROM schema_migrations"))
      .rows.map((r) => r.name),
  );

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await steps[file]?.(client);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        file,
      ]);
      await client.query("COMMIT");
      ran.push(file);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }
  return ran;
}
