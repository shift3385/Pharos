import type { PoolClient } from "pg";

/**
 * Deletes the user's stored AI key (IA-12, ADR-0034). Account recovery
 * (SEC-08/SEC-09, ADR-0045) calls it inside its own transaction: whoever
 * recovers an account may not be its owner, so the key the owner uploaded
 * must not stay usable. Returns whether there was a key to delete.
 */
export async function wipeAiVault(
  client: Pick<PoolClient, "query">,
  userId: string,
): Promise<boolean> {
  const { rowCount } = await client.query(
    "DELETE FROM ai_vault WHERE user_id = $1",
    [userId],
  );
  return (rowCount ?? 0) > 0;
}
