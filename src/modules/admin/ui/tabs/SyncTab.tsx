import { useTranslation } from "react-i18next";
import { GitCompare, LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "@modules/auth";
import { useSyncStatus } from "@modules/sync-offline";
import { TruncatedText } from "@shared/ui/TruncatedText";
import { StatusPill } from "@shared/ui/StatusPill";
import { SettingsRow, SettingsSection } from "../SettingsSection";

const TONE = { synced: "success", pending: "info", offline: "neutral", conflicts: "warning" } as const;

/** Administración → Sincronización (SPEC §8): the status the shell already
 *  keeps (`SyncStatusProvider`, read with `useSyncStatus`), the account,
 *  conflicts (the existing ConflictPanel) and «Sincronizar ahora». Only real
 *  counts: no last-sync time or pushed/pulled totals, which nothing records. */
export function SyncTab() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const sync = useSyncStatus();

  return (
    <div className="adm-stack">
      <SettingsSection title={t("admin.sync.title")} desc={t("admin.sync.desc")}>
        <SettingsRow label={t("admin.sync.status")}>
          {sync ? (
            <StatusPill dot tone={TONE[sync.status]} className="admin-sync-status">
              {sync.label}
            </StatusPill>
          ) : (
            <span className="adm-hint">—</span>
          )}
        </SettingsRow>

        <SettingsRow label={t("admin.sync.account")}>
          <div className="adm-inline adm-inline--fill">
            <TruncatedText value={user?.email ?? "—"} className="adm-account" />
            <button type="button" className="adm-btn adm-btn--secondary" onClick={() => void logout()}>
              <LogOut size={16} aria-hidden="true" />
              {t("auth.logout")}
            </button>
          </div>
        </SettingsRow>

        <SettingsRow label={t("admin.sync.conflicts")} hint={t("admin.sync.conflictsHint")}>
          <button
            type="button"
            className="adm-btn adm-btn--secondary"
            disabled={!sync || sync.conflicts === 0}
            title={sync && sync.conflicts === 0 ? t("admin.sync.noConflicts") : undefined}
            onClick={() => sync?.openConflicts()}
          >
            <GitCompare size={16} aria-hidden="true" />
            {t("admin.sync.review", { count: sync?.conflicts ?? 0 })}
          </button>
        </SettingsRow>

        <div className="adm-actions">
          <span className="adm-actions__spacer" />
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            disabled={!sync || sync.syncing}
            onClick={() => sync?.runSync()}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {sync?.syncing ? t("admin.sync.syncing") : t("admin.sync.now")}
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}
