import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@modules/auth";
import { useSyncStatus } from "@modules/sync-offline";
import {
  addLocalNotification,
  listNotifications,
  markNotificationsRead,
  notify,
  NOTIFICATIONS_CHANGED,
  pullNotifications,
} from "../api/notificationsApi";
import { CASE_REVIEW_EVENT, notificationOfReview, reviewEventOf } from "../model/caseReview";
import { notificationOfPlanReview, PLAN_REVIEW_EVENT, planReviewEventOf } from "../model/planReview";
import { unreadCount } from "../model/group";
import type { AppNotification } from "../model/types";
import { NotificationsContext, type NotificationsValue } from "./notificationsContext";

/** How often the shell asks the server, while signed in, online and visible. */
const PULL_EVERY_MS = 60_000;

/** How long a new sync conflict must stay open before it is notified: more
 *  than one read of the sync state (every 5 s). */
const CONFIRM_MS = 6_000;


/**
 * Mounted once in the shell, inside `SyncStatusProvider`. It keeps the list,
 * pulls it every minute, after every sync and when the connection comes back, turns new sync
 * conflicts into a local notification, and turns K's case review events into
 * notifications for the other people concerned.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const sync = useSyncStatus();
  const [items, setItems] = useState<AppNotification[]>([]);

  const reload = useCallback(() => {
    if (!userId) {
      setItems([]);
      return;
    }
    void listNotifications(userId).then(setItems, () => undefined);
  }, [userId]);

  const refresh = useCallback(() => {
    if (userId) void pullNotifications(userId);
  }, [userId]);

  useEffect(() => {
    reload();
    refresh();
    const onChanged = () => reload();
    const onOnline = () => refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    window.addEventListener("online", onOnline);
    // After every sync too: a notification often comes with the change.
    window.addEventListener("pharos:synced", onOnline);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine !== false) refresh();
    }, PULL_EVERY_MS);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pharos:synced", onOnline);
      window.clearInterval(timer);
    };
  }, [reload, refresh]);

  // K's review events → the people concerned (agreed contract, CAS-02).
  useEffect(() => {
    const onReview = (e: Event) => {
      const event = reviewEventOf(e);
      const input = event && notificationOfReview(event);
      if (input) void notify(input);
    };
    window.addEventListener(CASE_REVIEW_EVENT, onReview);
    return () => window.removeEventListener(CASE_REVIEW_EVENT, onReview);
  }, []);

  // A plan's «Aprobar» and «Pedir cambios» → its author (FIX-43).
  useEffect(() => {
    const onPlanReview = (e: Event) => {
      const event = planReviewEventOf(e);
      const input = event && notificationOfPlanReview(event);
      if (input) void notify(input);
    };
    window.addEventListener(PLAN_REVIEW_EVENT, onPlanReview);
    return () => window.removeEventListener(PLAN_REVIEW_EVENT, onPlanReview);
  }, []);

  // New sync conflicts → a notification of this device. Only an increase
  // seen while the app runs counts; the first count read is where we start
  // (FIX-49: the 0 shown before it was read made a conflict already open at
  // start-up look new, and each start added a notification).
  const conflicts = sync?.conflicts ?? 0;
  const known = sync?.conflictsKnown !== false;
  // The count also counts key clashes and refused changes, which a sync can
  // open and close within seconds: a notice is written only for a rise still
  // there CONFIRM_MS later, so none is ever written for a conflict that is
  // no longer open (FIX-49: «1 conflicto…, este minuto» with none open).
  const seen = useRef<number | null>(null);
  const latest = useRef(conflicts);
  latest.current = conflicts;
  useEffect(() => {
    if (!known) return;
    const before = seen.current;
    seen.current = conflicts;
    if (before === null || conflicts <= before || !userId) return;
    const timer = window.setTimeout(() => {
      if (latest.current <= before) return;
      const at = new Date().toISOString();
      void addLocalNotification(userId, {
        kind: "sync.conflict",
        subject: { entity: "sync", id: at, title: "" },
        data: { count: latest.current - before },
        dedupeKey: `sync.conflict:${at}`,
      });
    }, CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [conflicts, known, userId]);

  // No conflict open (FIX-47, FIX-49): nothing is left to review, so their
  // notifications stop counting on the bell. Whenever the count read is zero,
  // not only on a drop seen while the app runs: FIX-47's drop missed a
  // notification still being written when the conflict was resolved («Me
  // quedo con la mía» right after it appeared), and one left by an earlier
  // session, so it stayed unread on the bell.
  useEffect(() => {
    if (!known || conflicts > 0 || !userId) return;
    const ids = items
      .filter((n) => n.kind === "sync.conflict" && !n.readAt)
      .map((n) => n.id);
    if (ids.length) void markNotificationsRead(userId, ids);
  }, [conflicts, known, items, userId]);

  const markRead = useCallback(
    (ids: string[]) => {
      if (ids.length) void markNotificationsRead(userId, ids);
    },
    [userId],
  );
  const markAllRead = useCallback(() => void markNotificationsRead(userId, "all"), [userId]);
  const openConflicts = useCallback(() => sync?.openConflicts(), [sync]);

  const value = useMemo<NotificationsValue>(
    () => ({ items, unread: unreadCount(items), refresh, markRead, markAllRead, openConflicts, conflicts }),
    [items, refresh, markRead, markAllRead, openConflicts, conflicts],
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
