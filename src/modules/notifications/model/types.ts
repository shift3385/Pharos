// Notifications (RED-W2, ADR-0048): what someone did that concerns you.

/** Kinds that travel between people, through the server. */
export const TRAVELLING_KINDS = [
  "invitation.received",
  "case.review_requested",
  "case.approved",
  "case.changes_requested",
  "defect.assigned",
  "cycle.closed",
  "member.joined",
  "member.removed",
] as const;

export type TravellingKind = (typeof TRAVELLING_KINDS)[number];
/** `sync.conflict` stays on the device that has the conflict. */
export type NotificationKind = TravellingKind | "sync.conflict";

/** What a notification is about. */
export interface NotificationSubject {
  entity: string;
  id: string;
  /** Human key (`BM-CP-0142`), when it has one. */
  key?: string;
  title: string;
}

export interface AppNotification {
  id: string;
  /** `server`: delivered to the account; `local`: this device only. */
  origin: "server" | "local";
  kind: NotificationKind | string;
  actorId: string | null;
  actorName: string;
  workspaceId: string | null;
  projectId: string | null;
  subject: NotificationSubject;
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

/** Who to notify: some people (by account id), or every member of the
 *  workspace. The sender is never notified. */
export type Recipients = { userIds: string[] } | { workspace: true };

/** The event API other tracks call (`notify`). */
export interface NotifyInput {
  kind: TravellingKind;
  to: Recipients;
  workspaceId?: string | null;
  projectId?: string | null;
  subject: NotificationSubject;
  /** Extra per kind, at most 2 KB as JSON. `path` (an app path starting with
   *  «/») overrides where the direct action goes. */
  data?: Record<string, unknown>;
  /** Same key for the same event: stored once per recipient. */
  dedupeKey?: string | null;
}

/** Kept this long, and at most `MAX_KEPT` (ADR-0048). */
export const RETENTION_DAYS = 90;
export const MAX_KEPT = 500;
