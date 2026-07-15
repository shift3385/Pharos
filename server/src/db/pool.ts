import { Pool } from "pg";

/** Creates a pg connection pool for the given connection string. */
export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}
