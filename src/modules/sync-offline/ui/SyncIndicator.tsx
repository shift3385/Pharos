import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { useToast } from "@shared/ui/Toast";
import { syncLocalState, syncNow, syncStatus } from "../api/syncApi";
import { hydrateFromBackend } from "../web/webSync";
import { ConflictPanel } from "./ConflictPanel";
import "./SyncIndicator.css";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Topbar status indicator (spec §9): Synced / Pending changes (n) / Offline,
 *  with a "Sync now" button, plus Conflicts (n) that opens the conflict panel
 *  (Phase 8C). Counts come from the local oplog. */
export function SyncIndicator() {
  const { t } = useTranslation();
  const toast = useToast();
  const { status: authStatus } = useAuth();
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

  /** Silent background sync (startup / reconnect). On desktop runs the full
   *  push/pull; on the web it hydrates the caches from the backend. Errors are
   *  ignored here; the manual button surfaces them. */
  async function autoSync() {
    if (!navigator.onLine || !authedRef.current) return;
    try {
      if (isTauri()) await syncNow();
      else await hydrateFromBackend();
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
      if (isTauri()) {
        const { pushed, pulled, conflicts: found } = await syncNow();
        toast(
          found > 0
            ? t("sync.conflictToast", { count: found })
            : t("sync.doneToast", { pushed, pulled }),
        );
      } else {
        const pulled = await hydrateFromBackend();
        toast(t("sync.doneToast", { pushed: 0, pulled }));
      }
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
