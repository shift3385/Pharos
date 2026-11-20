import { createContext, useContext } from "react";
import type { AppNotification } from "../model/types";

/** What `NotificationsProvider` (mounted once, in the app shell) shares. */
export interface NotificationsValue {
  items: AppNotification[];
  unread: number;
  /** Asks the server now (the panel does it when it opens). */
  refresh: () => void;
  markRead: (ids: string[]) => void;
  markAllRead: () => void;
  /** Opens the sync conflicts (a conflict's direct action). */
  openConflicts: () => void;
  /** Sync conflicts still open: with none, a conflict's notification has
   *  nothing left to resolve and shows no «Resolver» (FIX-47). */
  conflicts: number;
}

export const NotificationsContext = createContext<NotificationsValue | null>(null);

/** The shell's notifications (RED-W2). Null outside the provider. */
export function useNotifications(): NotificationsValue | null {
  return useContext(NotificationsContext);
}
