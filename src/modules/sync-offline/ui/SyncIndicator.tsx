import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { useToast } from "@shared/ui/Toast";
import { syncAny, syncLocalState, syncStatus } from "../api/syncApi";
import { SyncHttpError } from "../api/transport";
import { ConflictPanel } from "./ConflictPanel";
import "./SyncIndicator.css";

/** Topbar status indicator (spec §9): Synced / Pending changes (n) / Offline,
 *  with a "Sync now" button, plus Conflicts (n) that opens the conflict panel
 *  (Phase 8C). Counts are the signed-in account's: from the local oplog on the
 *  desktop, from the outbox and web conflicts in the browser. */
export function SyncIndicator() {
  const { t } = useTranslation();
  const toast = useToast();
  const { status: authStatus, user } = useAuth();
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [syncing, setSyncing] = useState(false);
  // Read the latest auth status inside stable event handlers.
  const authedRef = useRef(authStatus === "authenticated");
  authedRef.current = authStatus === "authenticated";

  async function refresh() {
    const s = await syncLocalState().catch(() => ({
      pending: 0,
      conflicts: 0,
    }));
    setPending(s.pending);
    setConflicts(s.conflicts);
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
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("pharos:sync-state", changed);
    window.addEventListener("pharos:sync-conflict", lost);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("pharos:sync-state", changed);
      window.removeEventListener("pharos:sync-conflict", lost);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync once the session is ready (waits for the token refresh on startup,
  // so we never fire a request with a stale/expired access token), and again
  // when another account signs in: counts and sync are per account (FIX-07).
  useEffect(() => {
    void refresh();
    if (authStatus === "authenticated") void autoSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, user?.id]);

  /** Silent background sync (startup / reconnect). Errors are ignored here;
   *  the manual button surfaces them. On the web a failed push stays in the
   *  outbox and is retried. */
  async function autoSync() {
    if (!navigator.onLine || !authedRef.current) return;
    try {
      await syncAny();
    } catch {
      /* offline or transient — the indicator stays as-is */
    }
    await refresh();
  }

  const status = syncStatus(online, pending, conflicts);
  const label =
    status === "offline"
      ? t("sync.offline")
      : status === "conflicts"
        ? t("sync.conflicts", { count: conflicts })
        : status === "pending"
          ? t("sync.pending", { count: pending })
          : t("sync.synced");

  async function runSync() {
    setSyncing(true);
    try {
      const { pushed, pulled, conflicts: found } = await syncAny();
      toast(
        found > 0
          ? t("sync.conflictToast", { count: found })
          : t("sync.doneToast", { pushed, pulled }),
      );
    } catch (e) {
      // Surface the underlying cause (missing command after an un-rebuilt app,
      // HTTP status, network error…) for diagnosis.
      console.error("[sync] failed:", e);
      toast(failure(e));
    } finally {
      setSyncing(false);
      await refresh();
    }
  }

  return (
    <div className="sync" title={label}>
      <span className={`sync__dot sync__dot--${status}`} aria-hidden="true" />
      <span className="sync__label">{label}</span>
      {conflicts > 0 && (
        <button
          type="button"
          className="sync__btn"
          onClick={() => setPanelOpen(true)}
        >
          {t("sync.conflict.review")}
        </button>
      )}
      {status !== "offline" && (
        <button
          type="button"
          className="sync__btn"
          onClick={() => void runSync()}
          disabled={syncing}
        >
          {syncing ? t("sync.syncing") : t("sync.now")}
        </button>
      )}
      {panelOpen && (
        <ConflictPanel
          onClose={() => setPanelOpen(false)}
          // Push the kept version right away when online.
          onResolved={() => void autoSync()}
        />
      )}
    </div>
  );
}
