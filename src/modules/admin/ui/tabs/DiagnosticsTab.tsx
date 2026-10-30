import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileArchive, ShieldCheck } from "lucide-react";
import { useToast } from "@shared/ui/Toast";
import { ReportedError } from "@shared/ui/notify";
import { exportDiagnostics, logClientError } from "@shared/diagnostics";
import { APP_VERSION } from "@shared/version";
import { SettingsRow, SettingsSection } from "../SettingsSection";

/** Administración → Diagnóstico (SPEC §8, BASE-08): the installed version and
 *  «Exportar diagnóstico», which never includes the user's data. */
export function DiagnosticsTab() {
  const { t } = useTranslation();
  const toast = useToast();
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

  return (
    <div className="adm-stack">
      <SettingsSection
        title={t("admin.diagnostics.title")}
        desc={t("admin.diagnostics.subtitle")}
        testId="admin-diagnostics"
      >
        <SettingsRow label={t("admin.diagnostics.version")}>
          <span className="t-id">{APP_VERSION}</span>
        </SettingsRow>
        <SettingsRow
          label={t("admin.diagnostics.export")}
          hint={t("admin.diagnostics.desc")}
          hintId="adm-diag-desc"
        >
          <div className="adm-folder">
            <div className="adm-inline">
              <button
                type="button"
                className="adm-btn adm-btn--secondary"
                aria-describedby="adm-diag-desc adm-diag-excludes"
                onClick={() => void exportDiag()}
                disabled={exporting}
              >
                <FileArchive size={16} aria-hidden="true" />
                {exporting ? t("diagnostics.exporting") : t("diagnostics.export")}
              </button>
            </div>
            <span id="adm-diag-excludes" className="adm-note">
              <ShieldCheck size={15} aria-hidden="true" />
              {t("admin.diagnostics.excludes")}
            </span>
          </div>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
