// Notifications (RED-W2, ADR-0048). The server keeps them per recipient; the
// desktop keeps an encrypted copy (Rust `notifications.rs`) and an outbox, so
// the panel works offline and an event emitted offline leaves later. The web
// keeps nothing: it reads the server each time.
//
// Nothing here throws to the caller of `notify`: a notification never blocks
// or fails the change it is about.

import { getSession } from "@modules/auth";
import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type { Assert, Contract, Covers } from "@shared/contracts";
import type { AppNotification, NotificationKind, NotificationSubject, NotifyInput } from "../model/types";

/** Fired on `window` when the local list changed (a pull, a read mark, a
 *  local notification), so the shell re-reads it. */
export const NOTIFICATIONS_CHANGED = "pharos:notifications-changed";

interface ServerRow {
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
}

interface PullAnswer {
  items: ServerRow[];
  cursor: number;
  more: boolean;
  keptIds: string[];
  unread: number;
}

/** What the desktop keeps (`notifications::Notification`). */
interface LocalRow extends ServerRow {
  origin: string;
}

/** A local notification (`notifications::LocalNotification`). */
interface LocalInput {
  kind: string;
  projectId: string | null;
  subject: unknown;
  data: unknown;
  dedupeKey: string | null;
}

interface OutboxItem {
  id: string;
  body: unknown;
}

const PULL_PAGES = 5;

const changed = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
};

const asSubject = (v: unknown): NotificationSubject => {
  const o = (v && typeof v === "object" ? v : {}) as Partial<NotificationSubject>;
  return {
    entity: typeof o.entity === "string" ? o.entity : "",
    id: typeof o.id === "string" ? o.id : "",
    key: typeof o.key === "string" ? o.key : undefined,
    title: typeof o.title === "string" ? o.title : "",
  };
};

const toNotification = (r: ServerRow | LocalRow): AppNotification => ({
  id: r.id,
  origin: "origin" in r && r.origin === "local" ? "local" : "server",
  kind: r.kind,
  actorId: r.actorId,
  actorName: r.actorName,
  workspaceId: r.workspaceId,
  projectId: r.projectId,
  subject: asSubject(r.subject),
  data: r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {},
  createdAt: r.createdAt,
  readAt: r.readAt,
});

// The web's copy: this page only, never stored.
let webItems: AppNotification[] = [];
let webUser = "";

/** The account's notifications, newest first. */
export async function listNotifications(userId: string): Promise<AppNotification[]> {
  if (!userId) return [];
  if (isTauri()) return (await invoke<LocalRow[]>("notifications_list", { userId })).map(toNotification);
  return webUser === userId ? webItems : [];
}

/** Brings the account's notifications from the server. Offline, or against a
 *  server without notifications (older than 0.5), it changes nothing. */
export async function pullNotifications(userId: string): Promise<void> {
  if (!userId) return;
  try {
    if (!isTauri()) {
      const answer = await serverApi.get<PullAnswer>("/api/me/notifications?since=0");
      webUser = userId;
      webItems = answer.items.map(toNotification).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      changed();
      return;
    }
    await flushNotifications(userId);
    let since = await invoke<number>("notifications_cursor", { userId });
    for (let page = 0; page < PULL_PAGES; page++) {
      const answer = await serverApi.get<PullAnswer>(`/api/me/notifications?since=${since}`);
      await invoke("notifications_apply_pull", {
        userId,
        items: answer.items,
        cursor: answer.cursor,
        keptIds: answer.more ? null : answer.keptIds,
      });
      since = answer.cursor;
      if (!answer.more) break;
    }
    changed();
  } catch {
    // Offline or not available: the copy stays as it is.
  }
}

/** Sends what this device owes the server: events emitted offline and read
 *  marks made here. Stops at the first failure; the rest waits. */
export async function flushNotifications(userId: string): Promise<void> {
  if (!isTauri() || !userId) return;
  try {
    const outbox = await invoke<OutboxItem[]>("notifications_outbox_list", { userId });
    for (const item of outbox) {
      try {
        await serverApi.post("/api/notifications", { input: item.body });
      } catch (e) {
        // A refusal (400: an event this server cannot take) is dropped; a
        // failure to reach it waits.
        if (!isRefusal(e)) return;
      }
      await invoke("notifications_outbox_done", { userId, ids: [item.id] });
    }
    const pending = await invoke<string[]>("notifications_read_pending", { userId });
    for (let i = 0; i < pending.length; i += 500) {
      const ids = pending.slice(i, i + 500);
      await serverApi.post("/api/me/notifications/read", { input: { ids } });
      await invoke("notifications_read_sent", { userId, ids });
    }
  } catch {
    // Kept for the next time.
  }
}

const isRefusal = (e: unknown) =>
  !!e && typeof e === "object" && "status" in e && (e as { status: number }).status === 400;

/**
 * The event API (RED-W2, ADR-0048) other modules call after a change that
 * concerns someone else. It never throws and never waits for the network:
 * offline, the desktop keeps the event and sends it later. Nobody is notified
 * of their own action; until workspaces exist the server delivers nothing.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const session = await getSession();
    if (!session) return;
    if ("userIds" in input.to) {
      const others = input.to.userIds.filter((id) => id && id !== session.userId);
      if (others.length === 0) return;
      input = { ...input, to: { userIds: others } };
    }
    const body = {
      kind: input.kind,
      to: input.to,
      workspaceId: input.workspaceId ?? null,
      projectId: input.projectId ?? null,
      subject: input.subject,
      data: input.data ?? {},
      dedupeKey: input.dedupeKey ?? null,
    };
    if (isTauri()) {
      await invoke("notifications_outbox_add", { userId: session.userId, body });
      void flushNotifications(session.userId);
    } else {
      await serverApi.post("/api/notifications", { input: body });
    }
  } catch {
    // A notification never fails the change it is about.
  }
}

/** Adds a notification of this device only (desktop). */
export async function addLocalNotification(
  userId: string,
  n: { kind: NotificationKind; projectId?: string | null; subject: NotificationSubject; data?: Record<string, unknown>; dedupeKey?: string | null },
): Promise<void> {
  if (!isTauri() || !userId) return;
  const notification: LocalInput = {
    kind: n.kind,
    projectId: n.projectId ?? null,
    subject: n.subject,
    data: n.data ?? {},
    dedupeKey: n.dedupeKey ?? null,
  };
  try {
    if (await invoke<boolean>("notifications_add_local", { userId, notification })) changed();
  } catch {
    // Nothing to show is better than a failed sync screen.
  }
}

/** Marks some notifications, or all, read here and on the account. */
export async function markNotificationsRead(userId: string, ids: string[] | "all"): Promise<void> {
  if (!userId) return;
  if (!isTauri()) {
    const now = new Date().toISOString();
    webItems = webItems.map((n) => (ids === "all" || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n));
    changed();
    try {
      await serverApi.post("/api/me/notifications/read", { input: ids === "all" ? { all: true } : { ids } });
    } catch {
      // The next pull shows the server's state.
    }
    return;
  }
  await invoke("notifications_mark_read", { userId, ids: ids === "all" ? null : ids });
  changed();
  void flushNotifications(userId);
}

// The Rust contract (BASE-05, ADR-0026): `tsc` fails if these stop matching.
export type _RustContract = [
  Assert<Covers<Contract.Notification, LocalRow>>,
  Assert<Covers<LocalInput, Contract.LocalNotification>>,
  Assert<Covers<Contract.OutboxItem, OutboxItem>>,
];
