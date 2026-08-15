import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { useToast } from "@shared/ui/Toast";
import { syncNow, syncPendingCount, syncStatus } from "../api/syncApi";
import "./SyncIndicator.css";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Topbar status indicator (spec §9): Synced / Pending changes (n) / Offline,
 *  with a "Sync now" button. Phase 8A shows local pending count from the oplog;
 *  the backend push/pull (button action) lands in 8B. */
export function SyncIndicator() {
  const { t } = useTranslation();
  const toast = useToast();
  const { status: authStatus } = useAuth();
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [syncing, setSyncing] = useState(false);
  // Read the latest auth status inside stable event handlers.
  const authedRef = useRef(authStatus === "authenticated");
  authedRef.current = authStatus === "authenticated";

  async function refresh() {
    setPending(await syncPendingCount().catch(() => 0));
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    const on = () => {
      setOnline(true);
      void autoSync(); // reconnected → push/pull automatically (spec §9)
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync once the session is ready (waits for the token refresh on startup,
  // so we never fire a request with a stale/expired access token).
  useEffect(() => {
    if (authStatus === "authenticated") void autoSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  /** Silent background sync (startup / reconnect). Errors are ignored here; the
   *  manual button surfaces them. */
  async function autoSync() {
    if (!isTauri() || !navigator.onLine || !authedRef.current) return;
    try {
      await syncNow();
    } catch {
      /* offline or transient — the indicator stays as-is */
    }
    await refresh();
  }

  const status = syncStatus(online, pending);
  const label =
    status === "offline"
      ? t("sync.offline")
      : status === "pending"
        ? t("sync.pending", { count: pending })
        : t("sync.synced");

  async function runSync() {
    setSyncing(true);
    try {
      const { pushed, pulled } = await syncNow();
      toast(t("sync.doneToast", { pushed, pulled }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Surface the underlying cause (missing command after an un-rebuilt app,
      // HTTP status, network error…) for diagnosis.
      console.error("[sync] failed:", msg);
      toast(
        msg === "not-authenticated"
          ? t("sync.needsAuth")
          : `${t("sync.failed")} — ${msg}`,
      );
    } finally {
      setSyncing(false);
      await refresh();
    }
  }

  return (
    <div className="sync" title={label}>
      <span className={`sync__dot sync__dot--${status}`} aria-hidden="true" />
      <span className="sync__label">{label}</span>
      {status !== "offline" && (
        <button type="button" className="sync__btn" onClick={() => void runSync()} disabled={syncing}>
          {syncing ? t("sync.syncing") : t("sync.now")}
        </button>
      )}
    </div>
  );
}
