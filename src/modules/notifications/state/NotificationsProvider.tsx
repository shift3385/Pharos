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
  // seen while the app runs counts; the first value is where we start.
  const conflicts = sync?.conflicts ?? 0;
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const before = seen.current;
    seen.current = conflicts;
    if (before === null || conflicts <= before || !userId) return;
    const at = new Date().toISOString();
    void addLocalNotification(userId, {
      kind: "sync.conflict",
      subject: { entity: "sync", id: at, title: "" },
      data: { count: conflicts - before },
      dedupeKey: `sync.conflict:${at}`,
    });
  }, [conflicts, userId]);

  const markRead = useCallback(
    (ids: string[]) => {
      if (ids.length) void markNotificationsRead(userId, ids);
    },
    [userId],
  );
  const markAllRead = useCallback(() => void markNotificationsRead(userId, "all"), [userId]);
  const openConflicts = useCallback(() => sync?.openConflicts(), [sync]);

  const value = useMemo<NotificationsValue>(
    () => ({ items, unread: unreadCount(items), refresh, markRead, markAllRead, openConflicts }),
    [items, refresh, markRead, markAllRead, openConflicts],
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
