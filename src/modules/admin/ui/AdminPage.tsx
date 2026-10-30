import { useCallback, useState } from "react";
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
 * `/ai` redirect here. Leaving Motor de IA with unsaved changes asks first.
 */
export function AdminPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = adminTabFrom(params.get("tab"));
  const [aiDirty, setAiDirty] = useState(false);
  const storedCount = useTemplateCount();
  const [templateCount, setTemplateCount] = useState<number | undefined>();

  const select = useCallback(
    (next: AdminTab) => {
      if (next === tab) return;
      if (tab === "ai" && aiDirty && !window.confirm(t("common.discardConfirm"))) return;
      setAiDirty(false);
      setParams({ tab: next }, { replace: true });
    },
    [tab, aiDirty, setParams, t],
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
        {tab === "ai" && <AiEngineTab onDirtyChange={setAiDirty} />}
        {tab === "templates" && <TemplatesTab onCount={setTemplateCount} />}
        {tab === "general" && <GeneralTab />}
        {tab === "sync" && <SyncTab />}
        {tab === "security" && <SecurityTab />}
        {tab === "diagnostics" && <DiagnosticsTab />}
      </div>
    </div>
  );
}
