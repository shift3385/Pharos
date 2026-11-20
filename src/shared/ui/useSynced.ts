import { useEffect, useRef } from "react";

/** Sent on `window` when the local data changed under the open pages: a sync
 *  that brought or combined changes (also a field-by-field auto-merge,
 *  SYNC-02), a resolved conflict, another process writing the database. */
export const SYNCED_EVENT = "pharos:synced";

/** Runs `reload` every time `SYNCED_EVENT` fires, with the latest props and
 *  state (FIX-48): every page that lists or shows synced entities reloads
 *  through it, so none is left showing what was there before the sync. */
export function useOnSynced(reload: () => void): void {
  const latest = useRef(reload);
  latest.current = reload;
  useEffect(() => {
    const on = () => latest.current();
    window.addEventListener(SYNCED_EVENT, on);
    return () => window.removeEventListener(SYNCED_EVENT, on);
  }, []);
}
