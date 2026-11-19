// Notices about API tokens (INT-02 A4, ADR-0052; migration 0031). A periodic
// sweep, not hooks on members and roles: whatever made a token inactive (a
// member removed, a workspace left, an account disabled), the sweep sees it.
//   - `token.expiring`: to the owner, 7 days before expiry, once. A personal
//     token's notice has no workspace.
//   - `token.inactive`: to the workspace's Test Managers, once each time a
//     project token's owner leaves or is disabled. They are the ones who can
//     reassign it.
// Each notice is claimed with an UPDATE … RETURNING, so two instances never
// send it twice.
import type { Pool } from "pg";
import { emitNotification, type Membership } from "../notifications/notifications.js";
import { EXPIRING_DAYS } from "./apiTokens.js";

/** The owner is an active member of the token's workspace and not disabled. */
const OWNER_OK = `
  NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.owner_user_id AND u.disabled_at IS NOT NULL)
  AND (t.workspace_id IS NULL OR EXISTS (
    SELECT 1 FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id AND w.deleted_at IS NULL
     WHERE m.workspace_id = t.workspace_id AND m.user_id = t.owner_user_id AND m.removed_at IS NULL))`;

const LIVE = `t.revoked_at IS NULL AND t.expires_at > $1`;

interface Claimed {
  id: string;
  kind: "project" | "personal";
  name: string;
  display_prefix: string;
  owner_user_id: string;
  owner_name: string;
  workspace_id: string | null;
  project_id: string | null;
  expires_at: Date;
  owner_disabled: boolean;
}

const RETURNING = `
  RETURNING t.id, t.kind, t.name, t.display_prefix, t.owner_user_id, t.workspace_id, t.project_id, t.expires_at,
            (SELECT coalesce(nullif(u.display_name, ''), u.email) FROM users u WHERE u.id = t.owner_user_id) AS owner_name,
            EXISTS (SELECT 1 FROM users u WHERE u.id = t.owner_user_id AND u.disabled_at IS NOT NULL) AS owner_disabled`;

export function createTokenNotices(deps: { pool: Pool; membership: Membership; now?: () => Date }) {
  const { pool } = deps;
  const now = () => deps.now?.() ?? new Date();
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function expiring(at: Date): Promise<number> {
    const soon = new Date(at.getTime() + EXPIRING_DAYS * 86_400_000);
    const { rows } = await pool.query<Claimed>(
      `UPDATE api_tokens t SET expiry_notified_at = $1
        WHERE ${LIVE} AND t.expires_at <= $2 AND t.expiry_notified_at IS NULL AND ${OWNER_OK}
       ${RETURNING}`,
      [at, soon],
    );
    for (const t of rows) {
      await emitNotification(
        pool,
        {
          kind: "token.expiring",
          actorId: null,
          recipientIds: [t.owner_user_id],
          trusted: true,
          workspaceId: t.workspace_id,
          projectId: t.project_id,
          subject: { entity: "api_token", id: t.id, key: t.display_prefix.slice(0, 64), title: t.name.slice(0, 300) },
          data: { tokenKind: t.kind, expiresAt: t.expires_at.toISOString() },
          dedupeKey: `token.expiring:${t.id}`,
        },
        deps.membership,
      );
    }
    return rows.length;
  }

  async function inactive(at: Date): Promise<number> {
    // Working again (the owner came back): the next departure is told too.
    await pool.query(
      `UPDATE api_tokens t SET inactive_notified_at = NULL
        WHERE t.inactive_notified_at IS NOT NULL AND ${OWNER_OK}`,
    );
    const { rows } = await pool.query<Claimed>(
      `UPDATE api_tokens t SET inactive_notified_at = $1
        WHERE t.kind = 'project' AND ${LIVE} AND t.inactive_notified_at IS NULL AND NOT (${OWNER_OK})
          AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id = t.workspace_id AND w.deleted_at IS NULL)
       ${RETURNING}`,
      [at],
    );
    for (const t of rows) {
      const workspaceId = t.workspace_id as string;
      await emitNotification(
        pool,
        {
          kind: "token.inactive",
          // The server noticed it: every Test Manager of the workspace is told.
          actorId: null,
          recipientIds: { workspaceId, roles: ["test_manager"] },
          trusted: true,
          workspaceId,
          projectId: t.project_id,
          subject: { entity: "api_token", id: t.id, key: t.display_prefix.slice(0, 64), title: t.name.slice(0, 300) },
          data: { reason: t.owner_disabled ? "owner_disabled" : "owner_left", ownerName: t.owner_name.slice(0, 200) },
          dedupeKey: `token.inactive:${t.id}:${at.getTime()}`,
        },
        deps.membership,
      );
    }
    return rows.length;
  }

  return {
    /** One pass. Returns how many notices it claimed. */
    async runOnce(): Promise<{ expiring: number; inactive: number }> {
      if (running) return { expiring: 0, inactive: 0 };
      running = true;
      try {
        const at = now();
        return { expiring: await expiring(at), inactive: await inactive(at) };
      } finally {
        running = false;
      }
    },
    start(intervalMs: number, log?: { error(o: unknown, m: string): void }) {
      if (timer) return;
      const tick = () => void this.runOnce().catch((e) => log?.error({ err: e }, "token notices"));
      tick();
      timer = setInterval(tick, intervalMs);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

export type TokenNotices = ReturnType<typeof createTokenNotices>;

declare module "fastify" {
  interface FastifyInstance {
    /** The token-notice sweep (tests call `runOnce` themselves). */
    tokenNotices: TokenNotices;
  }
}
