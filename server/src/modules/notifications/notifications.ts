// Notifications (RED-W2, ADR-0048): what someone did that concerns another
// person. The server keeps one row per recipient; each of the recipient's
// devices pulls what changed since its cursor (new rows and read marks).
//
// Two doors with the same shape:
// - other server modules call `emitNotification` inside their own
//   transaction (W: an invitation);
// - a client calls `POST /api/notifications` after a change it made (K: a
//   case sent to review; R: a defect assigned, a cycle closed).
//
// Who may notify whom is the workspace's business (W): `Membership` answers
// it. Until workspaces exist, the default lets nobody notify anyone else.
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { makeRequireAuth } from "../auth/middleware";
import type { TokenService } from "../auth/tokens";
import { requireSupportedVersion } from "../sync/sync.version";

/** Kinds that travel. `sync.conflict` is local to a device and never sent. */
export const NOTIFICATION_KINDS = [
  "invitation.received",
  "case.review_requested",
  "case.approved",
  "case.changes_requested",
  "defect.assigned",
  "cycle.closed",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Kept this long, and at most `MAX_PER_RECIPIENT` per person (ADR-0048). */
export const RETENTION_DAYS = 90;
export const MAX_PER_RECIPIENT = 500;
/** Largest `data`, as JSON text. */
export const MAX_DATA_BYTES = 2 * 1024;
/** Largest page of a pull. */
export const PULL_LIMIT = 500;

/**
 * Who may be notified. W (workspaces) provides the real one; the default
 * accepts only the sender, who is then dropped (nobody is notified of their
 * own action), so a client's notifications go nowhere until W lands.
 */
export interface Membership {
  /** True if `actorId` may notify `recipientId` (they share a workspace). */
  canNotify(actorId: string, recipientId: string, workspaceId: string | null): Promise<boolean>;
  /** Members of a workspace, for `{ workspaceId }` recipients. */
  members(workspaceId: string): Promise<string[]>;
}

export const selfOnlyMembership: Membership = {
  canNotify: (actorId, recipientId) => Promise.resolve(actorId === recipientId),
  members: () => Promise.resolve([]),
};

const subjectSchema = z.object({
  entity: z.string().min(1).max(64),
  id: z.string().min(1).max(128),
  key: z.string().max(64).optional(),
  title: z.string().max(300),
});

const dataSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (v) => Buffer.byteLength(JSON.stringify(v), "utf8") <= MAX_DATA_BYTES,
    `data must be at most ${MAX_DATA_BYTES} bytes`,
  );

export interface EmitInput {
  kind: NotificationKind;
  actorId: string;
  /** People, or every member of a workspace. */
  recipientIds: string[] | { workspaceId: string };
  workspaceId?: string | null;
  projectId?: string | null;
  subject: z.infer<typeof subjectSchema>;
  data?: Record<string, unknown>;
  /** Same key for the same event: stored once per recipient. */
  dedupeKey?: string | null;
}

export interface NotificationRow {
  id: string;
  kind: string;
  actorId: string | null;
  actorName: string;
  workspaceId: string | null;
  projectId: string | null;
  subject: unknown;
  data: unknown;
  createdAt: string;
  readAt: string | null;
  seq: number;
}

type Db = Pool | PoolClient;

/** Recipients of an event: expanded, checked against `membership`, without
 *  the actor and without repeats. */
async function resolveRecipients(input: EmitInput, membership: Membership): Promise<string[]> {
  const wanted = Array.isArray(input.recipientIds)
    ? input.recipientIds
    : await membership.members(input.recipientIds.workspaceId);
  const workspace =
    input.workspaceId ?? (Array.isArray(input.recipientIds) ? null : input.recipientIds.workspaceId);
  const out: string[] = [];
  for (const id of new Set(wanted)) {
    if (id === input.actorId) continue;
    if (await membership.canNotify(input.actorId, id, workspace)) out.push(id);
  }
  return out;
}

/**
 * Stores an event for each recipient it may reach. Safe to call inside the
 * caller's transaction (pass its client). Returns the recipients it reached.
 */
export async function emitNotification(
  db: Db,
  input: EmitInput,
  membership: Membership = selfOnlyMembership,
): Promise<string[]> {
  const subject = subjectSchema.parse(input.subject);
  const data = dataSchema.parse(input.data ?? {});
  const recipients = await resolveRecipients(input, membership);
  if (recipients.length === 0) return [];
  await db.query(
    `INSERT INTO notifications
       (recipient_id, actor_id, actor_name, kind, workspace_id, project_id, subject, data, dedupe_key)
     SELECT r, $2::uuid, COALESCE((SELECT display_name FROM users WHERE id = $2::uuid), ''),
            $3, $4, $5, $6::jsonb, $7::jsonb, $8
       FROM unnest($1::uuid[]) AS r
     ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    [
      recipients,
      input.actorId,
      input.kind,
      input.workspaceId ?? null,
      input.projectId ?? null,
      JSON.stringify(subject),
      JSON.stringify(data),
      input.dedupeKey ?? null,
    ],
  );
  // Keep the newest MAX_PER_RECIPIENT of each recipient.
  await db.query(
    `DELETE FROM notifications n
      USING (SELECT id FROM (
               SELECT id, row_number() OVER (PARTITION BY recipient_id ORDER BY created_at DESC, seq DESC) AS rn
                 FROM notifications WHERE recipient_id = ANY($1::uuid[])) ranked
             WHERE rn > $2) old
      WHERE n.id = old.id`,
    [recipients, MAX_PER_RECIPIENT],
  );
  return recipients;
}

const toRow = (r: {
  id: string;
  kind: string;
  actor_id: string | null;
  actor_name: string;
  workspace_id: string | null;
  project_id: string | null;
  subject: unknown;
  data: unknown;
  created_at: Date;
  read_at: Date | null;
  seq: string;
}): NotificationRow => ({
  id: r.id,
  kind: r.kind,
  actorId: r.actor_id,
  actorName: r.actor_name,
  workspaceId: r.workspace_id,
  projectId: r.project_id,
  subject: r.subject,
  data: r.data,
  createdAt: r.created_at.toISOString(),
  readAt: r.read_at ? r.read_at.toISOString() : null,
  seq: Number(r.seq),
});

export function createNotificationStore(pool: Pool, membership: Membership = selfOnlyMembership) {
  return {
    membership,
    emit: (input: EmitInput) => emitNotification(pool, input, membership),

    /** What changed for `userId` after `since` (a `seq`), oldest first, plus
     *  the ids still kept, so a device drops what aged out here. */
    async pull(userId: string, since: number) {
      await pool.query(
        `DELETE FROM notifications
          WHERE recipient_id = $1 AND created_at < now() - make_interval(days => $2)`,
        [userId, RETENTION_DAYS],
      );
      const { rows } = await pool.query(
        `SELECT id, kind, actor_id, actor_name, workspace_id, project_id, subject, data,
                created_at, read_at, seq
           FROM notifications WHERE recipient_id = $1 AND seq > $2
          ORDER BY seq LIMIT $3`,
        [userId, since, PULL_LIMIT],
      );
      const items = rows.map(toRow);
      const kept = await pool.query<{ id: string }>(
        "SELECT id FROM notifications WHERE recipient_id = $1",
        [userId],
      );
      const unread = await pool.query<{ n: string }>(
        "SELECT count(*) AS n FROM notifications WHERE recipient_id = $1 AND read_at IS NULL",
        [userId],
      );
      return {
        items,
        cursor: items.length ? items[items.length - 1].seq : since,
        more: items.length === PULL_LIMIT,
        keptIds: kept.rows.map((r) => r.id),
        unread: Number(unread.rows[0].n),
      };
    },

    /** Marks some (or all) of `userId`'s notifications read. Each change
     *  bumps `seq`, so their other devices pull it. */
    async markRead(userId: string, ids: string[] | "all", at: Date) {
      const all = ids === "all";
      await pool.query(
        `UPDATE notifications SET read_at = $3, seq = nextval('notifications_seq')
          WHERE recipient_id = $1 AND read_at IS NULL AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))`,
        [userId, all ? null : ids, at],
      );
      const { rows } = await pool.query<{ n: string }>(
        "SELECT count(*) AS n FROM notifications WHERE recipient_id = $1 AND read_at IS NULL",
        [userId],
      );
      return { unread: Number(rows[0].n) };
    },
  };
}

export type NotificationStore = ReturnType<typeof createNotificationStore>;

const recipientsSchema = z.union([
  z.object({ userIds: z.array(z.uuid()).min(1).max(200) }),
  z.object({ workspace: z.literal(true) }),
]);

const emitSchema = z.object({
  input: z.object({
    kind: z.enum(NOTIFICATION_KINDS),
    to: recipientsSchema,
    workspaceId: z.string().max(128).nullish(),
    projectId: z.string().max(128).nullish(),
    subject: subjectSchema,
    data: dataSchema.optional(),
    dedupeKey: z.string().max(200).nullish(),
  }),
});

const readSchema = z.object({
  input: z.union([
    z.object({ ids: z.array(z.uuid()).min(1).max(PULL_LIMIT) }),
    z.object({ all: z.literal(true) }),
  ]),
});

const pullSchema = z.object({ since: z.coerce.number().int().min(0).default(0) });

export function notificationRoutes(
  app: FastifyInstance,
  deps: { tokens: TokenService; store: NotificationStore },
) {
  const preHandler = [makeRequireAuth(deps.tokens), requireSupportedVersion];

  app.get("/api/me/notifications", { preHandler }, (req: FastifyRequest) => {
    const { since } = pullSchema.parse(req.query);
    return deps.store.pull(req.userId as string, since);
  });

  app.post("/api/me/notifications/read", { preHandler }, (req: FastifyRequest) => {
    const { input } = readSchema.parse(req.body);
    return deps.store.markRead(req.userId as string, "all" in input ? "all" : input.ids, new Date());
  });

  app.post("/api/notifications", { preHandler }, async (req: FastifyRequest) => {
    const { input } = emitSchema.parse(req.body);
    const workspaceId = input.workspaceId ?? null;
    const recipientIds =
      "userIds" in input.to
        ? input.to.userIds
        : workspaceId
          ? { workspaceId }
          : [];
    const reached = await deps.store.emit({
      kind: input.kind,
      actorId: req.userId as string,
      recipientIds,
      workspaceId,
      projectId: input.projectId ?? null,
      subject: input.subject,
      data: input.data,
      dedupeKey: input.dedupeKey ?? null,
    });
    return { delivered: reached.length };
  });
}
