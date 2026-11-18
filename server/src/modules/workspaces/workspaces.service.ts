import type { Pool, PoolClient } from "pg";
import { AppError } from "../auth/errors";
import { appendWebEvent } from "../audit/audit.store";
import type { ServerClock } from "../sync/sync.hlc";
import { lockWorkspaces, MOVE_TOMBSTONE_SQL } from "../sync/sync.repository";
import { requireMembership, requireRole, WorkspaceErrors } from "./access";
import { hashCode, newInvitationCode } from "./invitations";
import { listMembers, memberships, type Membership } from "./members";
import { isRole, type WorkspaceRole } from "./roles";

/** A member as the workspace screens show it (and the desktop mirrors). */
export interface MemberView {
  userId: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: WorkspaceRole;
  addedAt: string;
}

export interface WorkspaceView {
  id: string;
  name: string;
  kind: "personal" | "shared";
  role: WorkspaceRole;
  /** «Aprobación independiente» (PLN-08, ADR-0049); the desktop mirrors it
   *  (and reads it as false when an older server leaves it out). */
  independentApproval: boolean;
  members: MemberView[];
}

export interface InvitationView {
  id: string;
  role: WorkspaceRole;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "accepted" | "revoked" | "expired";
}

/** App routes a notification's button opens (the W2 screens). */
export const WORKSPACE_PATHS = { invitation: "/workspaces/join", members: "/workspaces/members" } as const;

/** Things other tracks hook into, inside the same transaction (R:
 *  notifications, ADR-0042 §8; the shapes are R's
 *  `notificationWorkspaceHooks`). The defaults do nothing; `app.ts` wires
 *  them. Server-internal only: nothing a client sends reaches them. */
export interface WorkspaceHooks {
  /** An invitation was created. `inviteeUserId`: the registered account
   *  whose e-mail the note names, or null (the code alone says nobody). */
  invitationCreated?(
    client: PoolClient,
    ev: {
      invitationId: string;
      workspaceId: string;
      workspaceName: string;
      actorId: string;
      inviteeUserId: string | null;
      role: WorkspaceRole;
      path?: string;
    },
  ): Promise<void>;
  /** Someone accepted an invitation (R notifies the Test Managers). */
  memberJoined?(
    client: PoolClient,
    ev: { workspaceId: string; workspaceName: string; userId: string; role: WorkspaceRole; path?: string },
  ): Promise<void>;
  /** A Test Manager removed someone (not when one leaves by oneself). */
  memberRemoved?(
    client: PoolClient,
    ev: { workspaceId: string; workspaceName: string; userId: string; actorId: string },
  ): Promise<void>;
}

const EXPIRY_DAYS = [1, 7, 30] as const;
export type ExpiryDays = (typeof EXPIRY_DAYS)[number];

const conflict = (code: string, message: string) => new AppError(409, code, message);

export function createWorkspaceService(pool: Pool, clock: ServerClock, hooks: WorkspaceHooks = {}) {
  async function inTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async function members(q: Pick<Pool, "query"> | PoolClient, workspaceId: string): Promise<MemberView[]> {
    const { rows } = await q.query<{
      user_id: string;
      email: string;
      display_name: string;
      first_name: string;
      last_name: string;
      role: WorkspaceRole;
      added_at: Date;
    }>(
      `SELECT m.user_id, u.email, u.display_name, u.first_name, u.last_name, m.role, m.added_at
         FROM workspace_members m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = $1 AND m.removed_at IS NULL
        ORDER BY m.added_at, u.display_name`,
      [workspaceId],
    );
    return rows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      displayName: r.display_name,
      firstName: r.first_name,
      lastName: r.last_name,
      role: r.role,
      addedAt: r.added_at.toISOString(),
    }));
  }

  const view = async (m: Membership): Promise<WorkspaceView> => ({
    id: m.workspaceId,
    name: m.name,
    kind: m.kind,
    role: m.role,
    independentApproval: m.independentApproval,
    members: await members(pool, m.workspaceId),
  });

  /** A shared workspace the user manages, locked for the change. */
  async function managed(client: PoolClient, userId: string, workspaceId: string): Promise<Membership> {
    const m = await requireRole(client, userId, workspaceId, "members.manage");
    if (m.kind !== "shared") throw conflict("personal_workspace", "A personal workspace has no other members.");
    await lockWorkspaces(client, [workspaceId]);
    return m;
  }

  /** Refuses a change that would leave the workspace without a Test
   *  Manager. */
  async function keepsAManager(client: PoolClient, workspaceId: string, userId: string, newRole: WorkspaceRole | null) {
    if (newRole === "test_manager") return;
    const managers = await listMembers(client, workspaceId, { roles: ["test_manager"] });
    if (managers.length === 1 && managers[0].userId === userId) {
      throw conflict("last_test_manager", "The workspace needs another Test Manager first.");
    }
  }

  return {
    /** Every workspace of the user with its members (`GET /workspaces`). */
    async list(userId: string): Promise<WorkspaceView[]> {
      return Promise.all((await memberships(pool, userId)).map(view));
    },

    async create(userId: string, name: string): Promise<WorkspaceView> {
      const id = await inTx(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO workspaces (name, kind, created_by) VALUES ($1, 'shared', $2) RETURNING id`,
          [name.trim(), userId],
        );
        await c.query(
          `INSERT INTO workspace_members (workspace_id, user_id, role, added_by) VALUES ($1, $2, 'test_manager', $2)`,
          [rows[0].id, userId],
        );
        return rows[0].id;
      });
      return view(await requireMembership(pool, userId, id));
    },

    async rename(userId: string, workspaceId: string, name: string): Promise<WorkspaceView> {
      await inTx(async (c) => {
        await managed(c, userId, workspaceId);
        await c.query(`UPDATE workspaces SET name = $2 WHERE id = $1`, [workspaceId, name.trim()]);
      });
      return view(await requireMembership(pool, userId, workspaceId));
    },

    /** Turns «Aprobación independiente» on or off (PLN-08, ADR-0049): a Test
     *  Manager of a shared workspace (a personal one is always off). The
     *  approvals already given stay; the change is audited. */
    async setIndependentApproval(userId: string, workspaceId: string, enabled: boolean): Promise<WorkspaceView> {
      await inTx(async (c) => {
        const ws = await managed(c, userId, workspaceId);
        if (ws.independentApproval === enabled) return;
        await c.query(`UPDATE workspaces SET independent_approval = $2 WHERE id = $1`, [workspaceId, enabled]);
        await appendWebEvent(c, clock, {
          userId,
          workspaceId,
          action: "update",
          entity: "workspace",
          entityId: workspaceId,
          projectId: null,
          entityKey: ws.name,
          changes: { independentApproval: [ws.independentApproval, enabled] },
          summary: { independentApproval: enabled },
        });
      });
      return view(await requireMembership(pool, userId, workspaceId));
    },

    /** Deletes a shared workspace without live projects: its members get
     *  `workspace_revoked` on their next sync. */
    async remove(userId: string, workspaceId: string): Promise<void> {
      await inTx(async (c) => {
        await managed(c, userId, workspaceId);
        const live = await c.query(
          `SELECT 1 FROM documents WHERE workspace_id = $1 AND entity = 'project' AND NOT deleted LIMIT 1`,
          [workspaceId],
        );
        if (live.rowCount) throw conflict("workspace_not_empty", "Move or delete its projects first.");
        await c.query(`UPDATE workspaces SET deleted_at = now() WHERE id = $1`, [workspaceId]);
      });
    },

    async invite(
      userId: string,
      workspaceId: string,
      input: { role: WorkspaceRole; note?: string | null; expiresInDays: ExpiryDays },
    ): Promise<InvitationView & { code: string }> {
      return inTx(async (c) => {
        const ws = await managed(c, userId, workspaceId);
        const code = newInvitationCode();
        const { rows } = await c.query<{ id: string; created_at: Date; expires_at: Date }>(
          `INSERT INTO workspace_invitations (workspace_id, role, token_hash, note, invited_by, expires_at)
           VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6)) RETURNING id, created_at, expires_at`,
          [workspaceId, input.role, hashCode(code), input.note?.trim() || null, userId, input.expiresInDays],
        );
        if (hooks.invitationCreated) {
          const note = input.note?.trim().toLowerCase();
          const r = note ? await c.query<{ id: string }>(`SELECT id FROM users WHERE lower(email) = $1`, [note]) : null;
          const invitee = r?.rows[0]?.id;
          await hooks.invitationCreated(c, {
            invitationId: rows[0].id,
            workspaceId,
            workspaceName: ws.name,
            actorId: userId,
            inviteeUserId: invitee && invitee !== userId ? invitee : null,
            role: input.role,
            path: WORKSPACE_PATHS.invitation,
          });
        }
        return {
          id: rows[0].id,
          code,
          role: input.role,
          note: input.note?.trim() || null,
          createdAt: rows[0].created_at.toISOString(),
          expiresAt: rows[0].expires_at.toISOString(),
          status: "pending",
        };
      });
    },

    async invitations(userId: string, workspaceId: string): Promise<InvitationView[]> {
      await requireRole(pool, userId, workspaceId, "members.manage");
      const { rows } = await pool.query<{
        id: string;
        role: WorkspaceRole;
        note: string | null;
        created_at: Date;
        expires_at: Date;
        accepted_at: Date | null;
        revoked_at: Date | null;
      }>(
        `SELECT id, role, note, created_at, expires_at, accepted_at, revoked_at FROM workspace_invitations
          WHERE workspace_id = $1 ORDER BY created_at DESC`,
        [workspaceId],
      );
      const now = Date.now();
      return rows.map((r) => ({
        id: r.id,
        role: r.role,
        note: r.note,
        createdAt: r.created_at.toISOString(),
        expiresAt: r.expires_at.toISOString(),
        status: r.accepted_at
          ? "accepted"
          : r.revoked_at
            ? "revoked"
            : r.expires_at.getTime() <= now
              ? "expired"
              : "pending",
      }));
    },

    async revokeInvitation(userId: string, workspaceId: string, invitationId: string): Promise<void> {
      await inTx(async (c) => {
        await managed(c, userId, workspaceId);
        await c.query(
          `UPDATE workspace_invitations SET revoked_at = now()
            WHERE id = $1 AND workspace_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
          [invitationId, workspaceId],
        );
      });
    },

    /** What a code would join, without using it (the «Unirse» dialog). */
    async preview(code: string): Promise<{ workspaceName: string; role: WorkspaceRole; invitedBy: string }> {
      const { rows } = await pool.query<{ name: string; role: WorkspaceRole; display_name: string }>(
        `SELECT w.name, i.role, u.display_name FROM workspace_invitations i
           JOIN workspaces w ON w.id = i.workspace_id AND w.deleted_at IS NULL
           JOIN users u ON u.id = i.invited_by
          WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()`,
        [hashCode(code)],
      );
      if (!rows[0]) throw invalidInvitation();
      return { workspaceName: rows[0].name, role: rows[0].role, invitedBy: rows[0].display_name };
    },

    /** Uses a code: the user joins with its role (back again, if they were
     *  removed before). One use only. */
    async accept(userId: string, code: string): Promise<WorkspaceView> {
      const workspaceId = await inTx(async (c) => {
        const { rows } = await c.query<{ id: string; workspace_id: string; role: string; invited_by: string; name: string }>(
          `SELECT i.id, i.workspace_id, i.role, i.invited_by, w.name FROM workspace_invitations i
             JOIN workspaces w ON w.id = i.workspace_id AND w.deleted_at IS NULL
            WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
            FOR UPDATE OF i`,
          [hashCode(code)],
        );
        const inv = rows[0];
        if (!inv || !isRole(inv.role)) throw invalidInvitation();
        await lockWorkspaces(c, [inv.workspace_id]);
        const current = await c.query(
          `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL`,
          [inv.workspace_id, userId],
        );
        if (current.rowCount) throw conflict("already_member", "You are already a member of this workspace.");
        await c.query(
          `INSERT INTO workspace_members (workspace_id, user_id, role, added_by) VALUES ($1, $2, $3, $4)
           ON CONFLICT (workspace_id, user_id) DO UPDATE
             SET role = EXCLUDED.role, added_by = EXCLUDED.added_by, added_at = now(), removed_at = NULL`,
          [inv.workspace_id, userId, inv.role, inv.invited_by],
        );
        await c.query(`UPDATE workspace_invitations SET accepted_by = $2, accepted_at = now() WHERE id = $1`, [
          inv.id,
          userId,
        ]);
        await hooks.memberJoined?.(c, {
          workspaceId: inv.workspace_id,
          workspaceName: inv.name,
          userId,
          role: inv.role,
          path: WORKSPACE_PATHS.members,
        });
        return inv.workspace_id;
      });
      return view(await requireMembership(pool, userId, workspaceId));
    },

    async setRole(userId: string, workspaceId: string, memberId: string, role: WorkspaceRole): Promise<MemberView[]> {
      await inTx(async (c) => {
        await managed(c, userId, workspaceId);
        await requireMembership(c, memberId, workspaceId).catch(() => {
          throw new AppError(404, "not_found", "Member not found.");
        });
        await keepsAManager(c, workspaceId, memberId, role);
        await c.query(`UPDATE workspace_members SET role = $3 WHERE workspace_id = $1 AND user_id = $2`, [
          workspaceId,
          memberId,
          role,
        ]);
      });
      return members(pool, workspaceId);
    },

    /** Removes a member (a Test Manager), or the user leaves. The removed
     *  person's devices get `workspace_revoked` on their next sync. */
    async removeMember(userId: string, workspaceId: string, memberId: string): Promise<void> {
      await inTx(async (c) => {
        let ws: Membership;
        if (memberId === userId) {
          ws = await requireMembership(c, userId, workspaceId);
          if (ws.kind !== "shared") throw conflict("personal_workspace", "You cannot leave your personal workspace.");
          await lockWorkspaces(c, [workspaceId]);
        } else {
          ws = await managed(c, userId, workspaceId);
          await requireMembership(c, memberId, workspaceId).catch(() => {
            throw new AppError(404, "not_found", "Member not found.");
          });
        }
        await keepsAManager(c, workspaceId, memberId, null);
        await c.query(`UPDATE workspace_members SET removed_at = now() WHERE workspace_id = $1 AND user_id = $2`, [
          workspaceId,
          memberId,
        ]);
        if (memberId !== userId) {
          await hooks.memberRemoved?.(c, { workspaceId, workspaceName: ws.name, userId: memberId, actorId: userId });
        }
      });
    },

    /** Shares a project by moving it, with everything that hangs from it,
     *  to `destination` (ADR-0042 §5). The user must be Test Manager of both
     *  workspaces. Atomic: under both workspaces' write locks, every document
     *  of the project is written in the destination (same revision and HLC,
     *  a new seq, its location rewritten) and left in the origin as a move
     *  tombstone `{ movedTo }`; its key blocks follow; one audit event in
     *  each workspace says so. */
    async moveProject(
      userId: string,
      destination: string,
      projectId: string,
    ): Promise<{ moved: number; from: string; to: string }> {
      return inTx(async (c) => {
        const dest = await requireRole(c, userId, destination, "members.manage");
        if (dest.kind !== "shared") throw conflict("personal_workspace", "Move projects to a shared workspace.");
        const { rows: found } = await c.query<{ workspace_id: string }>(
          `SELECT d.workspace_id FROM documents d
             JOIN workspace_members m ON m.workspace_id = d.workspace_id AND m.user_id = $2 AND m.removed_at IS NULL
            WHERE d.entity = 'project' AND d.entity_id = $1 AND NOT d.deleted`,
          [projectId, userId],
        );
        const origin = found[0]?.workspace_id;
        if (!origin) throw new AppError(404, "not_found", "Project not found.");
        if (origin === destination) throw conflict("already_there", "The project is already in this workspace.");
        await requireRole(c, userId, origin, "members.manage");
        await lockWorkspaces(c, [origin, destination]);
        // Copy into the destination: same version, a new seq.
        const { rowCount } = await c.query(
          `INSERT INTO documents
             (workspace_id, entity, entity_id, payload, revision, author, deleted, hlc, author_user_id, updated_at, seq)
           SELECT $2, entity, entity_id,
                  CASE WHEN payload ? 'workspaceId' THEN jsonb_set(payload, '{workspaceId}', to_jsonb($4::text)) ELSE payload END,
                  revision, author, deleted, hlc, author_user_id, now(), nextval('documents_seq')
             FROM documents
            WHERE workspace_id = $1 AND NOT ${MOVE_TOMBSTONE_SQL}
              AND ((entity = 'project' AND entity_id = $3) OR payload->>'projectId' = $3)
            ORDER BY seq
           ON CONFLICT (workspace_id, entity, entity_id) DO UPDATE
             SET payload = EXCLUDED.payload, revision = EXCLUDED.revision, author = EXCLUDED.author,
                 deleted = EXCLUDED.deleted, hlc = EXCLUDED.hlc, author_user_id = EXCLUDED.author_user_id,
                 updated_at = now(), seq = nextval('documents_seq')`,
          [origin, destination, projectId, destination],
        );
        // What stays in the origin: a move tombstone per document.
        await c.query(
          `UPDATE documents SET deleted = true, payload = jsonb_build_object('movedTo', $2::text),
                  author_user_id = $4, updated_at = now(), seq = nextval('documents_seq')
            WHERE workspace_id = $1 AND NOT ${MOVE_TOMBSTONE_SQL}
              AND ((entity = 'project' AND entity_id = $3) OR payload->>'projectId' = $3)`,
          [origin, destination, projectId, userId],
        );
        // The contents its attachments name go with them (SYNC-04b): the
        // destination holds them too; the origin keeps its rows, as other
        // documents of it may name the same content.
        await c.query(
          `INSERT INTO blobs (workspace_id, sha256, size, mime, storage_key, uploaded_by, uploaded_at)
           SELECT $2, b.sha256, b.size, b.mime, b.storage_key, b.uploaded_by, b.uploaded_at
             FROM blobs b
            WHERE b.workspace_id = $1
              AND b.sha256 IN (SELECT payload->>'sha256' FROM documents
                                WHERE workspace_id = $2 AND entity = 'attachment' AND payload->>'projectId' = $3)
           ON CONFLICT (workspace_id, sha256) DO NOTHING`,
          [origin, destination, projectId],
        );
        await c.query(`UPDATE key_blocks SET workspace_id = $2, updated_at = now() WHERE project_id = $1`, [
          projectId,
          destination,
        ]);
        // One event per workspace: the project's location changed. An
        // update, so every desktop stores it (no new audit action).
        for (const ws of [origin, destination]) {
          await appendWebEvent(c, clock, {
            userId,
            workspaceId: ws,
            action: "update",
            entity: "project",
            entityId: projectId,
            projectId,
            entityKey: null,
            changes: { workspaceId: [origin, destination] },
            summary: { moved: { from: origin, to: destination, documents: rowCount ?? 0 } },
          });
        }
        return { moved: rowCount ?? 0, from: origin, to: destination };
      });
    },
  };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;

const invalidInvitation = () =>
  new AppError(410, "invitation_invalid", "This code was already used, revoked or expired. Ask for a new one.");

export { EXPIRY_DAYS, WorkspaceErrors };
