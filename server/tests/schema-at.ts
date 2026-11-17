import { readdirSync, readFileSync } from "node:fs";
import type { Pool, PoolClient } from "pg";
import { DATA_STEPS } from "../src/db/migrate";

const DIR = new URL("../migrations/", import.meta.url);

/** The migration files in order. */
export const migrationFiles = (): string[] =>
  readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

/** Runs one migration file (and its data step) on `client`, as the migrator
 *  does, in the schema its `search_path` names. */
export async function applyMigration(client: PoolClient, file: string): Promise<void> {
  await client.query(readFileSync(new URL(file, DIR), "utf8"));
  await DATA_STEPS[file]?.(client);
}

/** A client whose `search_path` is a fresh schema migrated up to `upTo`
 *  (included): the database as an older server left it, for the tests of a
 *  migration that a later one changed (the store is per workspace since
 *  0019, so 0004 and 0006 can no longer be replayed on the current schema).
 *  `drop()` removes the schema and releases the client. */
export async function schemaAt(
  pool: Pool,
  schema: string,
  upTo: string,
): Promise<{ client: PoolClient; drop: () => Promise<void> }> {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`bad schema name ${schema}`);
  const client = await pool.connect();
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  for (const file of migrationFiles().filter((f) => f <= upTo)) await applyMigration(client, file);
  return {
    client,
    drop: async () => {
      try {
        await client.query("SET search_path TO DEFAULT");
        await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        client.release();
      }
    },
  };
}
