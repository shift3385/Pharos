import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { AiEngineTab } from "@modules/ai";
import { TemplatesTab, useTemplateCount } from "@modules/templates";
import { ADMIN_PANEL_ID, adminTabFrom, type AdminTab } from "../model/tabs";
import { AdminTabs } from "./AdminTabs";
import { GeneralTab } from "./tabs/GeneralTab";
import { SyncTab } from "./tabs/SyncTab";
import { SecurityTab } from "./tabs/SecurityTab";
import { DiagnosticsTab } from "./tabs/DiagnosticsTab";
import "./Admin.css";

/**
 * Administration (SPEC §8, ScrAdministracion, ADR-0031): one screen with
 * grouped tabs — Recursos (Motor de IA, Plantillas) · Aplicación (General) ·
 * Cuenta y datos (Sincronización, Seguridad) · Soporte (Diagnóstico). The tab
 * lives in the URL (`/admin?tab=…`, Motor de IA by default); `/templates` and
 * `/ai` redirect here. Leaving a tab with unsaved changes asks first.
 */
export function AdminPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = adminTabFrom(params.get("tab"));
  // The current tab has unsaved changes (Motor de IA, General).
  const [dirty, setDirty] = useState(false);
  const storedCount = useTemplateCount();
  const [templateCount, setTemplateCount] = useState<number | undefined>();

  // An unknown `?tab=` shows Motor de IA; the URL says so too.
  const raw = params.get("tab");
  useEffect(() => {
    if (raw !== null && raw !== tab) setParams({ tab }, { replace: true });
  }, [raw, tab, setParams]);

  const select = useCallback(
    (next: AdminTab) => {
      if (next === tab) return;
      if (dirty && !window.confirm(t("common.discardConfirm"))) return;
      setDirty(false);
      setParams({ tab: next }, { replace: true });
    },
    [tab, dirty, setParams, t],
  );

  return (
    <div className="adm">
      <header className="adm__header">
        <h1 className="t-page-title">{t("admin.title")}</h1>
        <p className="adm__subtitle">{t("admin.subtitle")}</p>
      </header>

      <AdminTabs current={tab} counts={{ templates: templateCount ?? storedCount }} onSelect={select} />

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
        {tab === "sync" && <SyncTab />}
        {tab === "security" && <SecurityTab />}
        {tab === "diagnostics" && <DiagnosticsTab />}
      </div>
    </div>
  );
}
