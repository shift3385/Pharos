// Preferences of an account (UX-27, ADR-0038): small JSON values that travel
// with the account between its devices, today the Inicio board. Each user
// reads and writes only their own. The last write wins by the time of the
// change the client sends, so a change made offline and sent later still
// loses to a newer one made on another device.
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { makeRequireAuth } from "../auth/middleware";
import type { TokenService } from "../auth/tokens";
import { requireSupportedVersion } from "../sync/sync.version";

/** The keys an account may keep. A new preference is added here. */
export const PREFERENCE_KEYS = ["home.board"] as const;

/** Largest value accepted, as JSON text. */
export const MAX_VALUE_BYTES = 16 * 1024;

/** A change dated further ahead than this is dated now: a device with its
 *  clock in the future must not win every later change. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface PreferenceRow {
  key: string;
  value: unknown;
  updatedAt: string | null;
}

const keySchema = z.object({ key: z.enum(PREFERENCE_KEYS) });

/** `PUT` body, in the `{ input }` envelope of the web's domain writes. */
const putSchema = z.object({
  input: z.object({
    value: z
      .unknown()
      .refine((v) => v !== undefined, "value is required")
      .refine(
        (v) => Buffer.byteLength(JSON.stringify(v) ?? "", "utf8") <= MAX_VALUE_BYTES,
        `value must be at most ${MAX_VALUE_BYTES} bytes`,
      ),
    updatedAt: z.iso.datetime({ offset: true }),
  }),
});

export function createPreferenceStore(pool: Pool) {
  return {
    async get(userId: string, key: string): Promise<PreferenceRow> {
      const { rows } = await pool.query<{ value: unknown; updated_at: Date }>(
        "SELECT value, updated_at FROM user_preferences WHERE user_id = $1 AND key = $2",
        [userId, key],
      );
      const row = rows[0];
      return row
        ? { key, value: row.value, updatedAt: row.updated_at.toISOString() }
        : { key, value: null, updatedAt: null };
    },
    /** Keeps `value` unless a newer one is already stored; returns what is
     *  stored afterwards (the client adopts it when it lost). */
    async put(userId: string, key: string, value: unknown, updatedAt: Date): Promise<PreferenceRow> {
      await pool.query(
        `INSERT INTO user_preferences (user_id, key, value, updated_at)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (user_id, key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
           WHERE user_preferences.updated_at < EXCLUDED.updated_at`,
        [userId, key, JSON.stringify(value), updatedAt],
      );
      return this.get(userId, key);
    },
  };
}

export type PreferenceStore = ReturnType<typeof createPreferenceStore>;

export function preferenceRoutes(
  app: FastifyInstance,
  deps: { tokens: TokenService; store: PreferenceStore; now?: () => number },
) {
  const preHandler = [makeRequireAuth(deps.tokens), requireSupportedVersion];
  const now = deps.now ?? Date.now;

  app.get("/api/me/preferences/:key", { preHandler }, (req: FastifyRequest) => {
    const { key } = keySchema.parse(req.params);
    return deps.store.get(req.userId as string, key);
  });

  app.put("/api/me/preferences/:key", { preHandler }, (req: FastifyRequest) => {
    const { key } = keySchema.parse(req.params);
    const { input } = putSchema.parse(req.body);
    const at = Math.min(Date.parse(input.updatedAt), now() + MAX_CLOCK_SKEW_MS);
    return deps.store.put(req.userId as string, key, input.value, new Date(at));
  });
}
