// The workspaces' events as notifications (RED-W2, ADR-0048). W exposes
// `WorkspaceHooks` (invitationCreated, memberJoined, memberRemoved) and calls
// them inside its own transaction; these are the handlers to plug in. Who is
// told is decided here, so the emits are `trusted`: an invitee or a removed
// person is no longer (or not yet) a member.
import type { Pool, PoolClient } from "pg";
import { emitNotification, type Membership } from "./notifications";

type Db = Pool | PoolClient;

export interface InvitationCreated {
  invitationId: string;
  workspaceId: string;
  workspaceName: string;
  /** Who invited. */
  actorId: string;
  /** The registered account the invitation's email matches, if any: an
   *  invitation is a code, so without one nobody can be told. */
  inviteeUserId: string | null;
  role: string;
  /** Where the invitation is accepted in the app («/…»). */
  path?: string;
}

export interface MemberJoined {
  workspaceId: string;
  workspaceName: string;
  /** Who joined (the actor). */
  userId: string;
  role: string;
  /** Where the members are seen in the app («/…»). */
  path?: string;
}

export interface MemberRemoved {
  workspaceId: string;
  workspaceName: string;
  /** Who was removed: the one told. */
  userId: string;
  /** Who removed them (the actor). */
  actorId: string;
}

/** Roles told when someone joins. */
export const JOIN_WATCHERS = ["test_manager"] as const;

const subject = (workspaceId: string, title: string) => ({ entity: "workspace", id: workspaceId, title });

export function notificationWorkspaceHooks(membership: Membership) {
  return {
    async invitationCreated(db: Db, e: InvitationCreated): Promise<void> {
      if (!e.inviteeUserId) return;
      await emitNotification(
        db,
        {
          kind: "invitation.received",
          actorId: e.actorId,
          recipientIds: [e.inviteeUserId],
          workspaceId: e.workspaceId,
          subject: { entity: "workspace_invitation", id: e.invitationId, title: e.workspaceName },
          data: { role: e.role, ...(e.path ? { path: e.path } : {}) },
          dedupeKey: `${e.invitationId}:invitation.received`,
          trusted: true,
        },
        membership,
      );
    },

    async memberJoined(db: Db, e: MemberJoined): Promise<void> {
      await emitNotification(
        db,
        {
          kind: "member.joined",
          actorId: e.userId,
          recipientIds: { workspaceId: e.workspaceId, roles: JOIN_WATCHERS },
          workspaceId: e.workspaceId,
          subject: subject(e.workspaceId, e.workspaceName),
          data: { role: e.role, ...(e.path ? { path: e.path } : {}) },
          trusted: true,
        },
        membership,
      );
    },

    async memberRemoved(db: Db, e: MemberRemoved): Promise<void> {
      await emitNotification(
        db,
        {
          kind: "member.removed",
          actorId: e.actorId,
          recipientIds: [e.userId],
          workspaceId: e.workspaceId,
          subject: subject(e.workspaceId, e.workspaceName),
          trusted: true,
        },
        membership,
      );
    },
  };
}

export type NotificationWorkspaceHooks = ReturnType<typeof notificationWorkspaceHooks>;
