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
}

export const NotificationsContext = createContext<NotificationsValue | null>(null);

/** The shell's notifications (RED-W2). Null outside the provider. */
export function useNotifications(): NotificationsValue | null {
  return useContext(NotificationsContext);
}
