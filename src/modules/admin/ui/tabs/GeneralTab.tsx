import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Save } from "lucide-react";
import { useToast } from "@shared/ui/Toast";
import { SegmentedControl } from "@shared/ui/SegmentedControl";
import { useTheme } from "@shared/theme/useTheme";
import type { ThemePreference } from "@shared/theme/theme-context";
import { SUPPORTED_LANGUAGES, type Language } from "@shared/i18n";
import { ErrorSummary, FieldMessage } from "@shared/ui/FormField";
import { controlProps, useSaveGuard } from "@shared/ui/fieldProps";
import { numberInRange } from "@shared/validation";
import { applyBackground, loadSettings, saveSettings } from "../../model/settings";
import { DownloadFolderField } from "../DownloadFolderField";
import { SettingsRow, SettingsSection } from "../SettingsSection";
import { TrashSection } from "../TrashSection";

const THEMES: ThemePreference[] = ["light", "dark", "system"];

/** Administración → General (SPEC §8): appearance (theme with «Según el
 *  sistema», language, custom background) and files and storage (download
 *  folder, retention, Papelera). Theme and language apply at once, like the
 *  topbar's; background and retention are saved with «Guardar ajustes». */
export function GeneralTab() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { preference, setPreference } = useTheme();
  const [settings, setSettings] = useState(loadSettings());
  const fileRef = useRef<HTMLInputElement>(null);
  const language = (i18n.resolvedLanguage ?? "es") as Language;

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

  return (
    <div className="adm-stack">
      <SettingsSection title={t("admin.general.appearance")} desc={t("admin.general.appearanceDesc")}>
        <SettingsRow label={t("admin.general.theme")} hint={t("admin.general.themeHint")}>
          <SegmentedControl
            label={t("admin.general.theme")}
            size="lg"
            value={preference}
            onChange={setPreference}
            options={THEMES.map((mode) => ({ value: mode, label: t(`admin.general.themeOption.${mode}`) }))}
          />
        </SettingsRow>

        <SettingsRow label={t("admin.general.language")}>
          <SegmentedControl
            label={t("admin.general.language")}
            size="lg"
            value={language}
            onChange={(lng) => void i18n.changeLanguage(lng)}
            options={SUPPORTED_LANGUAGES.map((lng) => ({ value: lng, label: t(`language.${lng}`) }))}
          />
        </SettingsRow>

        <SettingsRow label={t("admin.settings.background")} labelId="adm-bg-label">
          <div className="adm-inline" role="group" aria-labelledby="adm-bg-label">
            {settings.backgroundImage && (
              <span
                className="adm-bg-preview"
                style={{ backgroundImage: `url("${settings.backgroundImage}")` }}
                aria-hidden="true"
              />
            )}
            <button type="button" className="adm-btn adm-btn--secondary" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={16} aria-hidden="true" />
              {t("admin.settings.bgChoose")}
            </button>
            {settings.backgroundImage && (
              <button
                type="button"
                className="adm-btn adm-btn--ghost"
                onClick={() => setSettings((s) => ({ ...s, backgroundImage: "" }))}
              >
                {t("admin.settings.bgClear")}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickBackground(e)} />
        </SettingsRow>

        <SettingsRow
          label={t("admin.settings.opacity")}
          hint={t("admin.settings.opacityHint")}
          htmlFor="adm-opacity"
          hintId="adm-opacity-hint"
        >
          <div className="adm-range">
            <input
              id="adm-opacity"
              type="range"
              min={0}
              max={100}
              step={5}
              aria-describedby="adm-opacity-hint"
              aria-valuetext={`${settings.backgroundOpacity} %`}
              value={settings.backgroundOpacity}
              onChange={(e) => setSettings((s) => ({ ...s, backgroundOpacity: Number(e.target.value) }))}
            />
            <span className="adm-range__value u-num" aria-hidden="true">
              {settings.backgroundOpacity} %
            </span>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t("admin.general.storage")} desc={t("admin.general.storageDesc")}>
        <DownloadFolderField />

        <SettingsRow
          label={t("admin.settings.retention")}
          hint={t("admin.settings.retentionHint")}
          htmlFor="adm-retention"
          hintId="adm-retention-hint"
        >
          <input
            {...controlProps("adm-retention", retentionIssue, "adm-retention-hint")}
            aria-required
            className="adm-input adm-input--number u-num"
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
          {retentionIssue && <FieldMessage id="adm-retention-msg" issue={retentionIssue} />}
        </SettingsRow>

        <TrashSection />

        {showSummary && retentionIssue && (
          <ErrorSummary
            ref={summaryRef}
            items={[{ label: t("admin.settings.retention"), issue: retentionIssue, fieldId: "adm-retention" }]}
          />
        )}
        <div className="adm-actions">
          <span className="adm-actions__spacer" />
          <button type="button" className="adm-btn adm-btn--primary" onClick={() => guard(save)}>
            <Save size={16} aria-hidden="true" />
            {t("admin.settings.save")}
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}
