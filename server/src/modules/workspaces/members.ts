import type { Pool, PoolClient } from "pg";
import { isRole, type WorkspaceRole } from "./roles";

/** A pool, or a client inside a transaction. */
export type Queryable = Pick<Pool, "query"> | PoolClient;

export type WorkspaceKind = "personal" | "shared";

/** One active membership of a user (SYNC-07). */
export interface Membership {
  workspaceId: string;
  role: WorkspaceRole;
  kind: WorkspaceKind;
  name: string;
  /** «Aprobación independiente» (PLN-08, ADR-0049): the approver of a plan
   *  or a case needs the approval role and is not its author. Always off in
   *  a personal workspace; on by default in a shared one. */
  independentApproval: boolean;
}

const ACTIVE = "m.removed_at IS NULL AND w.deleted_at IS NULL";

/** The workspace's policy; NULL is the default of its kind (migration 0025). */
const POLICY = "COALESCE(w.independent_approval, w.kind = 'shared') AS independent_approval";

/** The user's role in a workspace, or null when they are not an active
 *  member of a live workspace (removed, never added, or it was deleted). */
export async function membership(q: Queryable, userId: string, workspaceId: string): Promise<Membership | null> {
  if (!isUuid(workspaceId)) return null;
  const { rows } = await q.query<{ role: string; kind: WorkspaceKind; name: string; independent_approval: boolean }>(
    `SELECT m.role, w.kind, w.name, ${POLICY} FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.workspace_id = $1 AND m.user_id = $2 AND ${ACTIVE}`,
    [workspaceId, userId],
  );
  const r = rows[0];
  return r && isRole(r.role)
    ? { workspaceId, role: r.role, kind: r.kind, name: r.name, independentApproval: r.independent_approval }
    : null;
}

/** True when the user is an active member of the workspace (R: validates
 *  the recipients of a notification). */
export async function isMember(q: Queryable, userId: string, workspaceId: string): Promise<boolean> {
  return (await membership(q, userId, workspaceId)) !== null;
}

/** Active members of a workspace, optionally only those with some roles
 *  (R: expands a notification sent to `{ workspace: true }`). A disabled
 *  account (SEC-12) is not an active member: it keeps its membership, but
 *  is not notified and does not count as the workspace's Test Manager. */
export async function listMembers(
  q: Queryable,
  workspaceId: string,
  opts: { roles?: WorkspaceRole[] } = {},
): Promise<{ userId: string; role: WorkspaceRole }[]> {
  if (!isUuid(workspaceId)) return [];
  const { rows } = await q.query<{ user_id: string; role: WorkspaceRole }>(
    `SELECT m.user_id, m.role FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
       JOIN users u ON u.id = m.user_id AND u.disabled_at IS NULL
      WHERE m.workspace_id = $1 AND ${ACTIVE} AND ($2::text[] IS NULL OR m.role = ANY($2::text[]))
      ORDER BY m.added_at, m.user_id`,
    [workspaceId, opts.roles ?? null],
  );
  return rows.map((r) => ({ userId: r.user_id, role: r.role }));
}

/** Every active membership of the user, personal first. */
export async function memberships(q: Queryable, userId: string): Promise<Membership[]> {
  const { rows } = await q.query<{
    workspace_id: string;
    role: string;
    kind: WorkspaceKind;
    name: string;
    independent_approval: boolean;
  }>(
    `SELECT m.workspace_id, m.role, w.kind, w.name, ${POLICY} FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = $1 AND ${ACTIVE}
      ORDER BY (w.kind = 'personal') DESC, w.created_at, w.id`,
    [userId],
  );
  return rows
    .filter((r) => isRole(r.role))
    .map((r) => ({
      workspaceId: r.workspace_id,
      role: r.role as WorkspaceRole,
      kind: r.kind,
      name: r.name,
      independentApproval: r.independent_approval,
    }));
}

/** The user's personal workspace. Every account has one (migration 0019 and
 *  its trigger); a missing one is a broken database, not a user error. */
export async function personalOf(q: Queryable, userId: string): Promise<string> {
  const { rows } = await q.query<{ id: string }>(
    `SELECT id FROM workspaces WHERE created_by = $1 AND kind = 'personal'`,
    [userId],
  );
  if (!rows[0]) throw new Error(`workspaces: user ${userId} has no personal workspace`);
  return rows[0].id;
}

/** Users of the shared workspaces where `managerId` is Test Manager, without
 *  `managerId` (C, SEC-09: who an administrator may reset; the rest of the
 *  rule, «not a Test Manager elsewhere», is C's, ADR-0042 §8). */
export async function managedMembers(q: Queryable, managerId: string): Promise<string[]> {
  const { rows } = await q.query<{ user_id: string }>(
    `SELECT DISTINCT o.user_id FROM workspace_members me
       JOIN workspaces w ON w.id = me.workspace_id AND w.kind = 'shared' AND w.deleted_at IS NULL
       JOIN workspace_members o ON o.workspace_id = me.workspace_id AND o.removed_at IS NULL
      WHERE me.user_id = $1 AND me.role = 'test_manager' AND me.removed_at IS NULL AND o.user_id <> $1
      ORDER BY o.user_id`,
    [managerId],
  );
  return rows.map((r) => r.user_id);
}

/** True when the user ever belonged to the workspace and no longer does, or
 *  it was deleted (`workspace_revoked`, ADR-0042 §2). */
export async function wasMember(q: Queryable, userId: string, workspaceId: string): Promise<boolean> {
  if (!isUuid(workspaceId)) return false;
  const { rowCount } = await q.query(
    `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId],
  );
  return (rowCount ?? 0) > 0;
}

export const isUuid = (v: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
