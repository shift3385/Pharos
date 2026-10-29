import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useToast } from "@shared/ui/Toast";
import { ReportedError } from "@shared/ui/notify";
import { exportDiagnostics, logClientError } from "@shared/diagnostics";
import { APP_VERSION } from "@shared/version";
import { applyBackground, loadSettings, saveSettings } from "../model/settings";
import { DownloadFolderField } from "./DownloadFolderField";
import { ErrorSummary, FieldMessage } from "@shared/ui/FormField";
import { controlProps, useSaveGuard } from "@shared/ui/fieldProps";
import { numberInRange } from "@shared/validation";
import "./Admin.css";

/** Administration panel (spec §10): quick access to Templates and the AI engine,
 *  app personalization (custom background) and preferences, and diagnostics
 *  (installed version and "Exportar diagnóstico", BASE-08). */
export function AdminPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(loadSettings());
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  async function exportDiag() {
    setExporting(true);
    try {
      toast(t("diagnostics.exported", { file: await exportDiagnostics() }));
    } catch (e) {
      if (e instanceof ReportedError) return;
      logClientError(e, "diagnostic export");
      toast(t("diagnostics.failed"), "error");
    } finally {
      setExporting(false);
    }
  }

  // Retention outside 1–3650 days blocks saving the settings.
  const retentionIssue = numberInRange(settings.retentionDays, { min: 1, max: 3650, integer: true });
  const { guard, showSummary, summaryRef } = useSaveGuard(retentionIssue !== null);

  function save() {
    saveSettings(settings);
    const fresh = loadSettings();
    setSettings(fresh);
    applyBackground(fresh);
    toast(t("admin.saved"));
  }

  async function pickBackground(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const dataUri = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    setSettings((s) => ({ ...s, backgroundImage: dataUri }));
  }

  const sections = [
    { key: "templates", route: "/templates" },
    { key: "ai", route: "/ai" },
  ] as const;

  return (
    <section className="adm">
      <header className="adm__header">
        <h1>{t("admin.title")}</h1>
        <p className="adm__subtitle">{t("admin.subtitle")}</p>
      </header>

      <div className="adm__cards">
        {sections.map((s) => (
          <button key={s.key} type="button" className="adm__card" onClick={() => navigate(s.route)}>
            <span className="adm__card-title">{t(`admin.section.${s.key}.title`)}</span>
            <span className="adm__card-desc">{t(`admin.section.${s.key}.desc`)}</span>
          </button>
        ))}
      </div>

      <div className="adm__settings">
        <h2 className="adm__settings-title">{t("admin.settings.title")}</h2>

        <div className="adm__field">
          <span className="adm__label">{t("admin.settings.background")}</span>
          <div className="adm__bg-row">
            <button type="button" className="adm__btn" onClick={() => fileRef.current?.click()}>
              {t("admin.settings.bgChoose")}
            </button>
            {settings.backgroundImage && (
              <button
                type="button"
                className="adm__btn"
                onClick={() => setSettings((s) => ({ ...s, backgroundImage: "" }))}
              >
                {t("admin.settings.bgClear")}
              </button>
            )}
            {settings.backgroundImage && (
              <span
                className="adm__bg-preview"
                style={{ backgroundImage: `url("${settings.backgroundImage}")` }}
                aria-hidden="true"
              />
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickBackground(e)} />
        </div>

        <label className="adm__field">
          <span className="adm__label">
            {t("admin.settings.opacity")}: {settings.backgroundOpacity}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings.backgroundOpacity}
            onChange={(e) => setSettings((s) => ({ ...s, backgroundOpacity: Number(e.target.value) }))}
          />
          <span className="adm__hint">{t("admin.settings.opacityHint")}</span>
        </label>

        <div className="adm__field">
          <label className="adm__label" htmlFor="adm-retention">
            {t("admin.settings.retention")}
          </label>
          <input
            {...controlProps("adm-retention", retentionIssue, "adm-retention-hint")}
            aria-required
            type="number"
            min={1}
            max={3650}
            value={Number.isNaN(settings.retentionDays) ? "" : settings.retentionDays}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                retentionDays: e.target.value === "" ? Number.NaN : Number(e.target.value),
              }))
            }
          />
          <span id="adm-retention-hint" className="adm__hint">
            {t("admin.settings.retentionHint")}
          </span>
          {retentionIssue && <FieldMessage id="adm-retention-msg" issue={retentionIssue} />}
        </div>

        <DownloadFolderField />

        {showSummary && retentionIssue && (
          <ErrorSummary
            ref={summaryRef}
            items={[{ label: t("admin.settings.retention"), issue: retentionIssue, fieldId: "adm-retention" }]}
          />
        )}
        <button type="button" className="adm__save" onClick={() => guard(save)}>
          {t("admin.settings.save")}
        </button>
      </div>

      <div className="adm__settings" data-testid="admin-diagnostics">
        <h2 className="adm__settings-title">{t("admin.diagnostics.title")}</h2>
        <div className="adm__field">
          <span className="adm__label">{t("admin.diagnostics.version")}</span>
          <span className="adm__version">{APP_VERSION}</span>
        </div>
        <p className="adm__hint">{t("admin.diagnostics.desc")}</p>
        <p className="adm__hint">{t("admin.diagnostics.excludes")}</p>
        <button
          type="button"
          className="adm__btn adm__btn--start"
          onClick={() => void exportDiag()}
          disabled={exporting}
        >
          {exporting ? t("diagnostics.exporting") : t("diagnostics.export")}
        </button>
      </div>
    </section>
  );
}
