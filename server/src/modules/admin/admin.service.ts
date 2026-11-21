import type { Pool, PoolClient } from "pg";
import { AppError } from "../auth/errors.js";
import { appendWebEvent } from "../audit/audit.store.js";
import type { ServerClock } from "../sync/sync.hlc.js";
import { lockWorkspaces } from "../sync/sync.repository.js";
import { personalOf } from "../workspaces/members.js";
import { emitNotification } from "../notifications/notifications.js";
import { personNameSql } from "../auth/personName.js";

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
  // Disabling an account (SEC-12, ADR-0045 amendment B).
  disableSelf: () =>
    new AppError(400, "disable_self", "You cannot disable your own account."),
  targetDisabled: () =>
    new AppError(
      409,
      "account_disabled_target",
      "That account is disabled. Enable it first.",
    ),
  successorRequired: (workspaces: string[]) =>
    new AppError(
      409,
      "successor_required",
      "Choose a new Test Manager for each workspace the account manages alone.",
      { workspaces },
    ),
  invalidSuccessor: (workspaceId: string) =>
    new AppError(
      400,
      "invalid_successor",
      "The new Test Manager must be another active member of that workspace.",
      { workspaceId },
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
  /** SEC-12: when, by whom and why it was disabled; null when active. */
  disabled: { at: Date; byName: string | null; reason: string | null } | null;
}

/** Which accounts the list shows (SEC-12). */
export type UserStatus = "active" | "disabled" | "all";

/** A shared workspace the account is the only active Test Manager of
 *  (SEC-12): disabling it needs a successor among `candidates`, the other
 *  active members; with none, the workspace is left without one. */
export interface ManagedAlone {
  workspaceId: string;
  name: string;
  members: number;
  candidates: { userId: string; displayName: string; role: string }[];
}

type Queryable = Pick<PoolClient, "query">;

/** An administrator now: named and not disabled (SEC-12: a disabled
 *  administrator administers nothing). */
export async function isAdmin(q: Queryable, userId: string): Promise<boolean> {
  const { rows } = await q.query<{ is_admin: boolean }>(
    "SELECT is_admin AND disabled_at IS NULL AS is_admin FROM users WHERE id = $1",
    [userId],
  );
  return rows[0]?.is_admin === true;
}

/** True when an administrator disabled the account (SEC-12). Read on every
 *  authenticated request (`checkAccount`), by primary key. */
export async function isDisabled(
  q: Queryable,
  userId: string,
): Promise<boolean> {
  const { rows } = await q.query<{ disabled: boolean }>(
    "SELECT disabled_at IS NOT NULL AS disabled FROM users WHERE id = $1",
    [userId],
  );
  return rows[0]?.disabled === true;
}

/** Active administrators: named and not disabled. */
const ACTIVE_ADMINS_SQL =
  "SELECT count(*) AS n FROM users WHERE is_admin AND disabled_at IS NULL";

/** The shared workspaces `userId` is the only active Test Manager of, with
 *  the other active members who could take over. */
async function managedAlone(
  q: Queryable,
  userId: string,
): Promise<ManagedAlone[]> {
  const { rows } = await q.query<{ id: string; name: string }>(
    `SELECT w.id, w.name FROM workspace_members me
       JOIN workspaces w ON w.id = me.workspace_id AND w.kind = 'shared' AND w.deleted_at IS NULL
      WHERE me.user_id = $1 AND me.role = 'test_manager' AND me.removed_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM workspace_members o JOIN users u ON u.id = o.user_id
           WHERE o.workspace_id = w.id AND o.user_id <> $1 AND o.role = 'test_manager'
             AND o.removed_at IS NULL AND u.disabled_at IS NULL)
      ORDER BY lower(w.name), w.id`,
    [userId],
  );
  const out: ManagedAlone[] = [];
  for (const w of rows) {
    const { rows: m } = await q.query<{
      user_id: string;
      display_name: string;
      role: string;
    }>(
      // The candidate's name is the official one (FIX-51, `personNameSql`),
      // under the key older clients read.
      `SELECT o.user_id, ${personNameSql("u")} AS display_name, o.role
         FROM workspace_members o JOIN users u ON u.id = o.user_id
        WHERE o.workspace_id = $1 AND o.user_id <> $2 AND o.removed_at IS NULL AND u.disabled_at IS NULL
        ORDER BY lower(${personNameSql("u")}), o.user_id`,
      [w.id, userId],
    );
    out.push({
      workspaceId: w.id,
      name: w.name,
      members: m.length + 1,
      candidates: m.map((r) => ({
        userId: r.user_id,
        displayName: r.display_name,
        role: r.role,
      })),
    });
  }
  return out;
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
      status?: UserStatus;
    }): Promise<{
      users: AdminUser[];
      total: number;
      admins: number;
      disabled: number;
    }> {
      const search = opts.search?.trim()
        ? `%${opts.search.trim().toLowerCase()}%`
        : null;
      const status = opts.status ?? "all";
      // $1: search, $2: status.
      const where = `($1::text IS NULL OR lower(u.email) LIKE $1 OR lower(u.display_name) LIKE $1
                      OR lower(u.first_name || ' ' || u.last_name) LIKE $1)
                     AND ($2::text = 'all' OR ($2::text = 'disabled') = (u.disabled_at IS NOT NULL))`;
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
        disabled_at: Date | null;
        disabled_by_name: string | null;
        disabled_reason: string | null;
      }>(
        `SELECT u.id, u.email, u.display_name, u.first_name, u.last_name, u.is_admin, u.created_at,
                u.disabled_at, u.disabled_reason, ${personNameSql("db")} AS disabled_by_name,
                (SELECT count(*) FROM account_recovery_codes c WHERE c.user_id = u.id) AS codes_total,
                (SELECT count(*) FROM account_recovery_codes c WHERE c.user_id = u.id AND c.used_at IS NULL) AS codes_left,
                (SELECT count(*) FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
                  WHERE m.user_id = u.id AND m.removed_at IS NULL AND w.kind = 'shared' AND w.deleted_at IS NULL) AS workspaces
           FROM users u LEFT JOIN users db ON db.id = u.disabled_by WHERE ${where}
          ORDER BY u.is_admin DESC, lower(u.display_name), u.created_at
          OFFSET $3 LIMIT $4`,
        [search, status, opts.offset, opts.limit],
      );
      const { rows: counts } = await pool.query<{
        total: string;
        admins: string;
        disabled: string;
      }>(
        `SELECT count(*) FILTER (WHERE ${where}) AS total,
                count(*) FILTER (WHERE u.is_admin AND u.disabled_at IS NULL) AS admins,
                count(*) FILTER (WHERE u.disabled_at IS NOT NULL) AS disabled
           FROM users u`,
        [search, status],
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
          disabled: r.disabled_at
            ? {
                at: r.disabled_at,
                byName: r.disabled_by_name,
                reason: r.disabled_reason,
              }
            : null,
        })),
        total: Number(counts[0].total),
        admins: Number(counts[0].admins),
        disabled: Number(counts[0].disabled),
      };
    },

    /** What disabling an account would leave without a Test Manager, for
     *  the dialog (SEC-12). */
    async disableImpact(targetId: string): Promise<{
      managedAlone: ManagedAlone[];
      lastAdmin: boolean;
    }> {
      const { rows } = await pool.query<{
        active_admin: boolean;
      }>(
        "SELECT is_admin AND disabled_at IS NULL AS active_admin FROM users WHERE id = $1",
        [targetId],
      );
      if (!rows[0]) throw AdminErrors.notFound();
      const { rows: c } = await pool.query<{ n: string }>(ACTIVE_ADMINS_SQL);
      return {
        managedAlone: await managedAlone(pool, targetId),
        lastAdmin: rows[0].active_admin && Number(c[0].n) <= 1,
      };
    },

    /** Disables or re-enables an account (SEC-12, ADR-0045 amendment B).
     *  Disabling revokes its sessions and open reset links, names the
     *  `successors` (one per shared workspace it manages alone that has
     *  other active members) and leaves everything else as it was. Never
     *  oneself, never the last active administrator. Audited in both
     *  people's chains, and in each workspace a successor takes over. */
    setDisabled(
      actorId: string,
      targetId: string,
      input: {
        disabled: boolean;
        reason?: string | null;
        successors?: { workspaceId: string; userId: string }[];
      },
    ): Promise<{ disabled: boolean; changed: boolean }> {
      return tx(async (client) => {
        await client.query(ADMINS_LOCK);
        if (targetId === actorId) throw AdminErrors.disableSelf();
        const { rows } = await client.query<{
          name: string;
          active_admin: boolean;
          disabled_at: Date | null;
        }>(
          `SELECT ${personNameSql()} AS name, is_admin AND disabled_at IS NULL AS active_admin, disabled_at
             FROM users WHERE id = $1 FOR UPDATE`,
          [targetId],
        );
        const target = rows[0];
        if (!target) throw AdminErrors.notFound();
        if ((target.disabled_at !== null) === input.disabled)
          return { disabled: input.disabled, changed: false };

        if (!input.disabled) {
          await client.query(
            `UPDATE users SET disabled_at = NULL, disabled_by = NULL, disabled_reason = NULL,
                    updated_at = now() WHERE id = $1`,
            [targetId],
          );
          await lockPersonal(client, [actorId, targetId]);
          await auditAccountEvent(client, clock, actorId, targetId, {
            event: "account_enabled",
            target: targetId,
          });
          await auditAccountEvent(client, clock, targetId, targetId, {
            event: "account_enabled",
            by: actorId,
          });
          await emitNotification(client, {
            kind: "account.enabled",
            actorId,
            recipientIds: [targetId],
            trusted: true,
            subject: {
              entity: "account",
              id: targetId,
              title: target.name,
            },
          });
          return { disabled: false, changed: true };
        }

        if (target.active_admin) {
          const { rows: c } = await client.query<{ n: string }>(
            ACTIVE_ADMINS_SQL,
          );
          if (Number(c[0].n) <= 1) throw AdminErrors.lastAdmin();
        }
        // Every workspace written to, locked in one order (personal chains
        // and the workspaces a successor takes over).
        const alone = await managedAlone(client, targetId);
        const successors = new Map(
          (input.successors ?? []).map((s) => [s.workspaceId, s.userId]),
        );
        for (const workspaceId of successors.keys()) {
          if (!alone.some((w) => w.workspaceId === workspaceId))
            throw AdminErrors.invalidSuccessor(workspaceId);
        }
        const missing = alone
          .filter(
            (w) => w.candidates.length > 0 && !successors.has(w.workspaceId),
          )
          .map((w) => w.workspaceId);
        if (missing.length > 0) throw AdminErrors.successorRequired(missing);
        for (const w of alone) {
          const chosen = successors.get(w.workspaceId);
          if (chosen && !w.candidates.some((c) => c.userId === chosen))
            throw AdminErrors.invalidSuccessor(w.workspaceId);
        }
        await lockWorkspaces(client, [
          await personalOf(client, actorId),
          await personalOf(client, targetId),
          ...alone.map((w) => w.workspaceId),
        ]);

        const reason = input.reason?.trim() ? input.reason.trim() : null;
        await client.query(
          `UPDATE users SET disabled_at = now(), disabled_by = $2, disabled_reason = $3,
                  updated_at = now() WHERE id = $1`,
          [targetId, actorId, reason],
        );
        const { rowCount: sessionsClosed } = await client.query(
          `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
          [targetId],
        );
        await client.query(
          `UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
          [targetId],
        );

        const named: { workspaceId: string; userId: string }[] = [];
        for (const w of alone) {
          const successor = successors.get(w.workspaceId);
          if (!successor) continue;
          const before = w.candidates.find((c) => c.userId === successor)?.role;
          await client.query(
            `UPDATE workspace_members SET role = 'test_manager'
              WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL`,
            [w.workspaceId, successor],
          );
          await appendWebEvent(client, clock, {
            userId: actorId,
            workspaceId: w.workspaceId,
            action: "update",
            entity: "workspace",
            entityId: w.workspaceId,
            projectId: null,
            entityKey: w.name,
            changes: {},
            summary: {
              event: "test_manager_succession",
              from: targetId,
              to: successor,
              previousRole: before ?? null,
            },
          });
          named.push({ workspaceId: w.workspaceId, userId: successor });
        }

        await auditAccountEvent(client, clock, actorId, targetId, {
          event: "account_disabled",
          target: targetId,
          ...(reason && { reason }),
          sessionsClosed: sessionsClosed ?? 0,
          ...(named.length > 0 && { successors: named }),
        });
        await auditAccountEvent(client, clock, targetId, targetId, {
          event: "account_disabled",
          by: actorId,
          ...(reason && { reason }),
          sessionsClosed: sessionsClosed ?? 0,
        });

        // The Test Managers of each shared workspace of the account learn
        // it no longer has access.
        const { rows: shared } = await client.query<{
          workspace_id: string;
          name: string;
        }>(
          `SELECT w.id AS workspace_id, w.name FROM workspace_members m
             JOIN workspaces w ON w.id = m.workspace_id AND w.kind = 'shared' AND w.deleted_at IS NULL
            WHERE m.user_id = $1 AND m.removed_at IS NULL`,
          [targetId],
        );
        for (const ws of shared) {
          const { rows: managers } = await client.query<{ user_id: string }>(
            `SELECT m.user_id FROM workspace_members m JOIN users u ON u.id = m.user_id
              WHERE m.workspace_id = $1 AND m.role = 'test_manager' AND m.removed_at IS NULL
                AND u.disabled_at IS NULL AND m.user_id <> $2`,
            [ws.workspace_id, targetId],
          );
          await emitNotification(client, {
            kind: "member.disabled",
            actorId,
            recipientIds: managers.map((m) => m.user_id),
            trusted: true,
            workspaceId: ws.workspace_id,
            subject: {
              entity: "account",
              id: targetId,
              title: target.name,
            },
            data: { workspaceName: ws.name },
          });
        }
        return { disabled: true, changed: true };
      });
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
          name: string;
          disabled_at: Date | null;
        }>(
          `SELECT is_admin, ${personNameSql()} AS name, disabled_at FROM users WHERE id = $1`,
          [targetId],
        );
        const target = rows[0];
        if (!target) throw AdminErrors.notFound();
        if (target.is_admin === value)
          return { isAdmin: value, changed: false };
        // A disabled account is enabled first (SEC-12).
        if (value && target.disabled_at) throw AdminErrors.targetDisabled();
        // Only active administrators count (SEC-12): removing a disabled
        // one never leaves the server without one.
        if (!value && !target.disabled_at) {
          const { rows: c } = await client.query<{ n: string }>(
            ACTIVE_ADMINS_SQL,
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
              title: target.name,
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
