import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { SYNC_SETTINGS_EVENT, loadSettings } from "@modules/admin";
import { useAuth } from "@modules/auth";
import { useToast } from "@shared/ui/Toast";
import { useReducedMotion } from "@shared/ui/useReducedMotion";
import {
  syncAny,
  syncLocalState,
  syncStatus,
  type LocalSyncState,
} from "../api/syncApi";
import { SyncFailureLog, logSyncFailure } from "../api/syncFailure";
import { purgeDeleted } from "../api/purgeApi";
import { SyncHttpError } from "../api/transport";
import { ConflictPanel } from "./ConflictPanel";
import { SyncStatusContext, type SyncStatusValue } from "./syncStatusContext";
import "./SyncIndicator.css";

/** Sync state and background work (spec §9): Synced / Pending changes (n) /
 *  Offline / Conflicts (n), the 5 s refresh, auto-sync at sign-in, on
 *  reconnect and every few minutes (NC-025: Administración › Sincronización
 *  switches it and sets the interval), the purge (SYNC-06) and the conflict
 *  panel (Phase 8C). Never two syncs at once, and none offline. Counts are
 *  the signed-in account's: from the local oplog on the desktop, from the
 *  outbox and web conflicts in the browser. Mount it **once** (the app shell
 *  does): every `SyncIndicator` reads it, so moving the indicator between the
 *  sidebar, the icon strip and the mobile sheet never runs the work twice. */
export function SyncStatusProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { status: authStatus, user } = useAuth();
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [orphans, setOrphans] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [syncing, setSyncing] = useState(false);
  // One sync at a time (NC-025): a tick, a reconnect or the button while
  // another one runs does nothing.
  const busy = useRef(false);
  // Bumped when a sync ends: the next automatic one is N minutes after the
  // last sync of any kind (manual, reconnect, sign-in) — NC-025.
  const [lastSync, setLastSync] = useState(0);
  const [schedule, setSchedule] = useState(() => {
    const s = loadSettings();
    return { on: s.autoSync, minutes: s.autoSyncMinutes };
  });
  // Read the latest auth status inside stable event handlers.
  const authedRef = useRef(authStatus === "authenticated");
  authedRef.current = authStatus === "authenticated";
  // Background failures go to the log once until they change (BASE-08).
  const failures = useRef(new SyncFailureLog()).current;

  async function refresh() {
    const s: LocalSyncState = await syncLocalState()
      .then((state) => {
        failures.clear("state");
        return state;
      })
      .catch((e: unknown) => {
        failures.report(e, "state");
        return { pending: 0, conflicts: 0 };
      });
    setPending(s.pending);
    setConflicts(s.conflicts);
    setOrphans(s.orphans ?? 0);
  }

  /** User-facing reason of a failed sync. */
  function failure(e: unknown): string {
    if (e instanceof SyncHttpError && e.code === "unsupported_client_version")
      return t("sync.unsupportedVersion");
    const msg = e instanceof Error ? e.message : String(e);
    return msg === "not-authenticated"
      ? t("sync.needsAuth")
      : `${t("sync.failed")} — ${msg}`;
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    const on = () => {
      setOnline(true);
      void autoSync(); // reconnected → push/pull automatically (spec §9)
    };
    const off = () => setOnline(false);
    const changed = () => void refresh();
    // A web push lost to a newer version: the edit is kept, tell the user.
    const lost = (e: Event) => {
      const count = (e as CustomEvent<{ count: number }>).detail?.count ?? 1;
      toast(t("sync.webConflictToast", { count }));
    };
    // Changes the server refused for their content: they stay pending.
    const refused = (e: Event) => {
      const count = (e as CustomEvent<{ count: number }>).detail?.count ?? 1;
      toast(t("sync.skippedToast", { count }));
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("pharos:sync-state", changed);
    window.addEventListener("pharos:sync-conflict", lost);
    window.addEventListener("pharos:sync-skipped", refused);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("pharos:sync-state", changed);
      window.removeEventListener("pharos:sync-conflict", lost);
      window.removeEventListener("pharos:sync-skipped", refused);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync once the session is ready, and again when another account signs
  // in: counts and sync are per account (FIX-07). At startup the app enters with
  // the cached session before validating it, so this first sync may carry an
  // expired token; `sessionRequester` renews it, sharing the startup renewal.
  // The purge (SYNC-06) runs then too, also offline.
  useEffect(() => {
    void refresh();
    if (authStatus === "authenticated") {
      void purge();
      void autoSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, user?.id]);

  /** Removes for good what was deleted more than the Administration retention
   *  ago (SYNC-06). Best-effort: a failure only means it runs again later; it
   *  is logged once until it changes (BASE-08). */
  async function purge() {
    try {
      await purgeDeleted(loadSettings().retentionDays);
      failures.clear("purge");
    } catch (e) {
      failures.report(e, "purge");
    }
  }

  /** Silent background sync (startup / reconnect). The user is not told here;
   *  the manual button surfaces errors. A failure is logged once until it
   *  changes. On the web a failed push stays in the outbox and is retried. */
  async function autoSync() {
    if (busy.current || !navigator.onLine || !authedRef.current) return;
    busy.current = true;
    setSyncing(true);
    try {
      await syncAny();
      failures.clear("auto");
      await purge();
    } catch (e) {
      // Offline or transient: the indicator stays as-is.
      failures.report(e, "auto");
    } finally {
      busy.current = false;
      setSyncing(false);
      setLastSync((n) => n + 1);
    }
    await refresh();
  }

  // The periodic sync (NC-025): every `minutes` while it is on and the user
  // is signed in, counted from the last sync that ended (the timer restarts
  // with `lastSync`); `autoSync` skips a tick offline or while a sync runs.
  useEffect(() => {
    const reread = () => {
      const s = loadSettings();
      setSchedule({ on: s.autoSync, minutes: s.autoSyncMinutes });
    };
    window.addEventListener(SYNC_SETTINGS_EVENT, reread);
    return () => window.removeEventListener(SYNC_SETTINGS_EVENT, reread);
  }, []);
  useEffect(() => {
    if (!schedule.on || authStatus !== "authenticated") return;
    const id = window.setInterval(() => void autoSync(), schedule.minutes * 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule.on, schedule.minutes, authStatus, user?.id, lastSync]);

  const status = syncStatus(online, pending, conflicts);
  const label =
    status === "offline"
      ? t("sync.offline")
      : status === "conflicts"
        ? t("sync.conflicts", { count: conflicts })
        : status === "pending"
          ? t("sync.pending", { count: pending })
          : t("sync.synced");
  // Changes with no owner yet (desktop) cannot sync: say so in the tooltip.
  const title =
    orphans > 0 ? `${label} · ${t("sync.orphans", { count: orphans })}` : label;

  async function runSync() {
    if (busy.current) return;
    busy.current = true;
    setSyncing(true);
    try {
      const { pushed, pulled, conflicts: found } = await syncAny();
      await purge();
      toast(
        found > 0
          ? t("sync.conflictToast", { count: found })
          : t("sync.doneToast", { pushed, pulled }),
      );
    } catch (e) {
      // The toast tells the user; the log keeps the cause for diagnosis.
      logSyncFailure(e, "manual");
      toast(failure(e));
    } finally {
      busy.current = false;
      setSyncing(false);
      setLastSync((n) => n + 1);
      await refresh();
    }
  }

  const value: SyncStatusValue = {
    status,
    label,
    title,
    conflicts,
    pending,
    syncing,
    runSync: () => void runSync(),
    openConflicts: () => setPanelOpen(true),
  };
  return (
    <SyncStatusContext.Provider value={value}>
      {children}
      {panelOpen && (
        <ConflictPanel
          onClose={() => setPanelOpen(false)}
          // Push the kept version right away when online.
          onResolved={() => void autoSync()}
        />
      )}
    </SyncStatusContext.Provider>
  );
}

/**
 * Sync status (spec §9), read from `SyncStatusProvider`.
 * - `full` (sidebar foot, mobile user sheet): dot, label, «Revisar
 *   conflictos» when there are any, and «Sincronizar ahora».
 * - `compact` (84 px icon strip): a sync icon with the status dot on it, as
 *   a button that syncs now; its name and tooltip carry the status. With
 *   conflicts, it opens the panel.
 *
 * While a sync runs, manual or automatic (sign-in, reconnect, NC-025), the
 * arrows turn (`sync__spin`); with reduced motion they stay still and the
 * dot changes instead (`sync--busy`), UX-26.
 */
export function SyncIndicator({ variant = "full" }: { variant?: "full" | "compact" }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const sync = useContext(SyncStatusContext);
  if (!sync) return null;
  const { status, label, title, conflicts, syncing } = sync;
  const busy = syncing ? " sync--busy" : "";
  const icon = (size: number) => (
    <RefreshCw
      className={`sync__icon${syncing && !reducedMotion ? " sync__spin" : ""}`}
      size={size}
      aria-hidden="true"
      data-testid="sync-icon"
    />
  );
  const dot = <span className={`sync__dot sync__dot--${status}`} aria-hidden="true" />;

  if (variant === "compact") {
    const action = conflicts > 0 ? t("sync.conflict.review") : t("sync.now");
    // Still a button while it syncs or offline (`aria-disabled`), so its
    // tooltip keeps saying why it does nothing.
    const idle = (syncing || status === "offline") && conflicts === 0;
    const name = syncing ? t("sync.syncing") : `${label}. ${action}`;
    return (
      <button
        type="button"
        className={`sync sync--compact${busy}`}
        title={syncing ? t("sync.syncing") : `${title} · ${action}`}
        aria-label={name}
        aria-disabled={idle || undefined}
        aria-busy={syncing || undefined}
        data-testid="sync-compact"
        onClick={idle ? undefined : conflicts > 0 ? sync.openConflicts : sync.runSync}
      >
        {icon(18)}
        {dot}
      </button>
    );
  }

  return (
    <div className={`sync${busy}`} title={title} aria-busy={syncing || undefined}>
      {dot}
      <span className="sync__label">{label}</span>
      {conflicts > 0 && (
        <button type="button" className="sync__btn" onClick={sync.openConflicts}>
          {t("sync.conflict.review")}
        </button>
      )}
      {status !== "offline" && (
        <button
          type="button"
          className="sync__btn"
          onClick={sync.runSync}
          disabled={syncing}
        >
          {icon(13)}
          {syncing ? t("sync.syncing") : t("sync.now")}
        </button>
      )}
    </div>
  );
}
