import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { AiEngineTab } from "@modules/ai";
import { TemplatesTab, useTemplateCount } from "@modules/templates";
import { useUnsavedChangesGuard } from "@shared/ui/useUnsavedChangesGuard";
import { discardOptions, useConfirm } from "@shared/ui/useConfirm";
import { useAuth } from "@modules/auth";
import { ADMIN_PANEL_ID, adminTabFrom, adminTabGroups, type AdminTab } from "../model/tabs";
import { AdminTabs } from "./AdminTabs";
import { GeneralTab } from "./tabs/GeneralTab";
import { SyncTab } from "./tabs/SyncTab";
import { SecurityTab } from "./tabs/SecurityTab";
import { EvidenceTab } from "./tabs/EvidenceTab";
import { AuditTab } from "./tabs/AuditTab";
import { DiagnosticsTab } from "./tabs/DiagnosticsTab";
import { UsersTab } from "./tabs/UsersTab";
import "./Admin.css";

/**
 * Administration (SPEC §8, ScrAdministracion, ADR-0031): one screen with
 * grouped tabs — Recursos (Motor de IA, Plantillas) · Aplicación (General,
 * Usuarios: only for a server administrator, SEC-11) ·
 * Cuenta y datos (Sincronización, Seguridad, Evidencias, Auditoría) · Soporte
 * (Diagnóstico). The tab
 * lives in the URL (`/admin?tab=…`, Motor de IA by default); `/templates` and
 * `/ai` redirect here. Leaving a tab, or the screen, with unsaved changes
 * asks first.
 */
export function AdminPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  // «Usuarios» only for a server administrator (SEC-11).
  const isAdmin = useAuth().user?.isAdmin === true;
  const tab = adminTabFrom(params.get("tab"), isAdmin);
  // The current tab has unsaved changes (Motor de IA, General).
  const [dirty, setDirty] = useState(false);
  const storedCount = useTemplateCount();
  const [templateCount, setTemplateCount] = useState<number | undefined>();

  // Leaving Administración (sidebar, user menu, bottom bar, «Atrás», closing
  // the window) with unsaved changes asks first. `?tab=` changes go through:
  // switching tabs asks on its own, below.
  const { dialog } = useUnsavedChangesGuard(dirty, { ignore: true });

  // An unknown `?tab=` shows Motor de IA; the URL says so too.
  const raw = params.get("tab");
  useEffect(() => {
    if (raw !== null && raw !== tab) setParams({ tab }, { replace: true });
  }, [raw, tab, setParams]);

  // Switching tabs with changes asks with a Pharos confirmation (NC-017).
  const { confirm, dialog: switchDialog } = useConfirm();
  const select = useCallback(
    async (next: AdminTab) => {
      if (next === tab) return;
      if (dirty && !(await confirm(discardOptions(t)))) return;
      setDirty(false);
      setParams({ tab: next }, { replace: true });
    },
    [tab, dirty, setParams, t, confirm],
  );

  return (
    <div className="adm">
      {/* Title and tab strip share one band over the background photo (FIX-36). */}
      <div className="adm__top ui-backdrop">
        <header className="adm__header">
          <h1 className="t-page-title">{t("admin.title")}</h1>
          <p className="adm__subtitle">{t("admin.subtitle")}</p>
        </header>

        <AdminTabs
          current={tab}
          groups={adminTabGroups(isAdmin)}
          counts={{ templates: templateCount ?? storedCount }}
          onSelect={select}
        />
      </div>

      <div
        id={ADMIN_PANEL_ID}
        role="tabpanel"
        className="adm__panel"
        // Named by the tab's label alone (the tab also shows a counter).
        aria-label={t(`admin.tabs.${tab}`)}
        tabIndex={0}
      >
        {tab === "ai" && <AiEngineTab onDirtyChange={setDirty} />}
        {tab === "templates" && <TemplatesTab onCount={setTemplateCount} />}
        {tab === "general" && <GeneralTab onDirtyChange={setDirty} />}
        {tab === "users" && <UsersTab />}
        {tab === "sync" && <SyncTab />}
        {tab === "security" && <SecurityTab />}
        {tab === "evidence" && <EvidenceTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "diagnostics" && <DiagnosticsTab />}
      </div>
      {dialog}
      {switchDialog}
    </div>
  );
}
