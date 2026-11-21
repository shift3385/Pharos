import { createContext, useContext } from "react";
import type { syncStatus } from "../api/syncApi";

/** What `SyncStatusProvider` (mounted once, in the app shell) shares. */
export interface SyncStatusValue {
  status: ReturnType<typeof syncStatus>;
  label: string;
  title: string;
  conflicts: number;
  /** False until the first count of conflicts has been read: before it,
   *  `conflicts` is 0 because nothing is known yet (FIX-49). */
  conflictsKnown?: boolean;
  /** Local changes not sent yet. */
  pending: number;
  syncing: boolean;
  runSync: () => void;
  openConflicts: () => void;
}

export const SyncStatusContext = createContext<SyncStatusValue | null>(null);

/** The shell's sync state for screens that show it in full (Administración →
 *  Sincronización). Null outside `SyncStatusProvider`. Never mount another
 *  provider for it. */
export function useSyncStatus(): SyncStatusValue | null {
  return useContext(SyncStatusContext);
}
