import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

/**
 * Minimal forward-only SQL migration runner. Applies every `*.sql` file in
 * `migrations/` in lexical order exactly once, tracked in `schema_migrations`.
 * Each file runs inside a transaction.
 */
export async function runMigrations(pool: Pool): Promise<string[]> {
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

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
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
