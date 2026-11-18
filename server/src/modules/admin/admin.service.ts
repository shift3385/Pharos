import type { Pool, PoolClient } from "pg";
import { AppError } from "../auth/errors";
import { appendWebEvent } from "../audit/audit.store";
import type { ServerClock } from "../sync/sync.hlc";
import { lockWorkspaces } from "../sync/sync.repository";
import { personalOf } from "../workspaces/members";
import { emitNotification } from "../notifications/notifications";

// The server administrator (SEC-11, ADR-0045 amendment): an instance-level
// role, apart from the workspace roles. It is read from the database on every
// request (never from the JWT), so removing it takes effect at once.

/** Every change of who is an administrator takes this lock, so «the last
 *  administrator» and «the first account» are never decided twice at once. */
const ADMINS_LOCK =
  "SELECT pg_advisory_xact_lock(hashtext('pharos:server-admins'))";

export const AdminErrors = {
  forbidden: () =>
    new AppError(
      403,
      "admin_required",
      "Only a server administrator can do this.",
    ),
  notFound: () =>
    new AppError(404, "user_not_found", "That account does not exist."),
  lastAdmin: () =>
    new AppError(
      409,
      "last_admin",
      "The server needs at least one administrator.",
    ),
  self: () =>
    new AppError(
      400,
      "admin_reset_self",
      "Change your own password from your profile.",
    ),
};

/** What an administrator sees of an account (approved 2026-11-18: every
 *  account of the server, with name and email). */
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  createdAt: Date;
  recoveryCodes: { total: number; remaining: number };
  workspaces: number;
}

type Queryable = Pick<PoolClient, "query">;

export async function isAdmin(q: Queryable, userId: string): Promise<boolean> {
  const { rows } = await q.query<{ is_admin: boolean }>(
    "SELECT is_admin FROM users WHERE id = $1",
    [userId],
  );
  return rows[0]?.is_admin === true;
}

/** An event in `chainUserId`'s web chain, in their personal workspace. The
 *  caller holds that workspace's lock. */
export async function auditAccountEvent(
  client: PoolClient,
  clock: ServerClock,
  chainUserId: string,
  entityId: string,
  summary: Record<string, unknown>,
): Promise<void> {
  await appendWebEvent(client, clock, {
    workspaceId: await personalOf(client, chainUserId),
    userId: chainUserId,
    action: "update",
    entity: "account",
    entityId,
    projectId: null,
    entityKey: null,
    changes: {},
    summary,
  });
}

/** Locks the personal workspaces of the people an admin action writes to. */
export async function lockPersonal(
  client: PoolClient,
  userIds: string[],
): Promise<void> {
  const ids = await Promise.all(
    [...new Set(userIds)].map((u) => personalOf(client, u)),
  );
  await lockWorkspaces(client, ids);
}

export function createAdminService(deps: {
  pool: Pool;
  clock: ServerClock;
  /** Emails named by PHAROS_ADMINS, lowercased. */
  envAdmins: string[];
}) {
  const { pool, clock, envAdmins } = deps;

  async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    isAdmin: (userId: string) => isAdmin(pool, userId),

    /** Throws `admin_required` unless `userId` is an administrator now. */
    async requireAdmin(userId: string): Promise<void> {
      if (!(await isAdmin(pool, userId))) throw AdminErrors.forbidden();
    },

    /** PHAROS_ADMINS at start-up: names those accounts; never removes. */
    async applyEnvAdmins(): Promise<string[]> {
      if (envAdmins.length === 0) return [];
      const { rows } = await pool.query<{ id: string }>(
        `UPDATE users SET is_admin = true, updated_at = now()
          WHERE lower(email) = ANY($1::text[]) AND NOT is_admin RETURNING id`,
        [envAdmins],
      );
      return rows.map((r) => r.id);
    },

    /** A new account is an administrator when the server has none yet (the
     *  first account) or its email is in PHAROS_ADMINS. */
    nameOnSignUp(userId: string, email: string): Promise<boolean> {
      return tx(async (client) => {
        await client.query(ADMINS_LOCK);
        const { rows } = await client.query<{ any: boolean }>(
          "SELECT EXISTS (SELECT 1 FROM users WHERE is_admin) AS any",
        );
        if (rows[0].any && !envAdmins.includes(email.toLowerCase()))
          return false;
        await client.query("UPDATE users SET is_admin = true WHERE id = $1", [
          userId,
        ]);
        return true;
      });
    },

    async listUsers(opts: {
      search?: string;
      offset: number;
      limit: number;
    }): Promise<{ users: AdminUser[]; total: number; admins: number }> {
      const search = opts.search?.trim()
        ? `%${opts.search.trim().toLowerCase()}%`
        : null;
      const where = `($1::text IS NULL OR lower(u.email) LIKE $1 OR lower(u.display_name) LIKE $1
                      OR lower(u.first_name || ' ' || u.last_name) LIKE $1)`;
      const { rows } = await pool.query<{
        id: string;
        email: string;
        display_name: string;
        first_name: string;
        last_name: string;
        is_admin: boolean;
        created_at: Date;
        codes_total: string;
        codes_left: string;
        workspaces: string;
      }>(
        `SELECT u.id, u.email, u.display_name, u.first_name, u.last_name, u.is_admin, u.created_at,
                (SELECT count(*) FROM account_recovery_codes c WHERE c.user_id = u.id) AS codes_total,
                (SELECT count(*) FROM account_recovery_codes c WHERE c.user_id = u.id AND c.used_at IS NULL) AS codes_left,
                (SELECT count(*) FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
                  WHERE m.user_id = u.id AND m.removed_at IS NULL AND w.kind = 'shared' AND w.deleted_at IS NULL) AS workspaces
           FROM users u WHERE ${where}
          ORDER BY u.is_admin DESC, lower(u.display_name), u.created_at
          OFFSET $2 LIMIT $3`,
        [search, opts.offset, opts.limit],
      );
      const { rows: counts } = await pool.query<{
        total: string;
        admins: string;
      }>(
        `SELECT count(*) FILTER (WHERE ${where}) AS total, count(*) FILTER (WHERE u.is_admin) AS admins FROM users u`,
        [search],
      );
      return {
        users: rows.map((r) => ({
          id: r.id,
          email: r.email,
          displayName: r.display_name,
          firstName: r.first_name,
          lastName: r.last_name,
          isAdmin: r.is_admin,
          createdAt: r.created_at,
          recoveryCodes: {
            total: Number(r.codes_total),
            remaining: Number(r.codes_left),
          },
          workspaces: Number(r.workspaces),
        })),
        total: Number(counts[0].total),
        admins: Number(counts[0].admins),
      };
    },

    /** Names or removes an administrator. The last one cannot be removed,
     *  by another administrator or by themselves. */
    setAdmin(
      actorId: string,
      targetId: string,
      value: boolean,
    ): Promise<{ isAdmin: boolean; changed: boolean }> {
      return tx(async (client) => {
        await client.query(ADMINS_LOCK);
        const { rows } = await client.query<{
          is_admin: boolean;
          display_name: string;
        }>("SELECT is_admin, display_name FROM users WHERE id = $1", [
          targetId,
        ]);
        const target = rows[0];
        if (!target) throw AdminErrors.notFound();
        if (target.is_admin === value)
          return { isAdmin: value, changed: false };
        if (!value) {
          const { rows: c } = await client.query<{ n: string }>(
            "SELECT count(*) AS n FROM users WHERE is_admin",
          );
          if (Number(c[0].n) <= 1) throw AdminErrors.lastAdmin();
        }
        await client.query(
          "UPDATE users SET is_admin = $2, updated_at = now() WHERE id = $1",
          [targetId, value],
        );
        const event = value ? "admin_granted" : "admin_revoked";
        await lockPersonal(client, [actorId, targetId]);
        await auditAccountEvent(client, clock, actorId, targetId, {
          event,
          target: targetId,
        });
        if (targetId !== actorId) {
          await auditAccountEvent(client, clock, targetId, targetId, {
            event,
            by: actorId,
          });
          await emitNotification(client, {
            kind: value ? "account.admin_granted" : "account.admin_revoked",
            actorId,
            recipientIds: [targetId],
            trusted: true,
            subject: {
              entity: "account",
              id: targetId,
              title: target.display_name,
            },
            dedupeKey: null,
          });
        }
        return { isAdmin: value, changed: true };
      });
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
