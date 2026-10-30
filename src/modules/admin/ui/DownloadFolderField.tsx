import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Folder, FolderOpen } from "lucide-react";
import { downloadDir, type DownloadDirInfo } from "@shared/export/saveFile";
import { logClientError } from "@shared/diagnostics";
import { useToast } from "@shared/ui/Toast";
import { SettingsRow } from "./SettingsSection";

/** Download folder for every export (UX-02). The folder is chosen only with
 *  the native picker and is stored by the desktop app right away (it is not
 *  part of "Guardar ajustes"). The web preview has no folder: the browser
 *  decides where downloads go. */
export function DownloadFolderField() {
  const { t } = useTranslation();
  const toast = useToast();
  const available = downloadDir.available();
  const [info, setInfo] = useState<DownloadDirInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => {
    logClientError(e, "download folder");
    toast(t("admin.settings.downloadError"), "error");
  };

  useEffect(() => {
    if (available) downloadDir.get().then(setInfo, fail);
    // `fail` only reads stable values; run once per availability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  async function run(action: () => Promise<DownloadDirInfo | null>) {
    setBusy(true);
    try {
      const next = await action();
      if (next) {
        setInfo(next);
        toast(t("admin.saved"));
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const shown = info?.path ?? "";
  const full = `${shown || "—"}${info && !info.custom ? ` (${t("admin.settings.downloadDefault")})` : ""}`;
  return (
    <SettingsRow
      label={t("admin.settings.download")}
      labelId="adm-download-label"
      hint={available ? t("admin.settings.downloadHint") : t("admin.settings.downloadWebHint")}
    >
      {available && (
        <div className="adm-folder" role="group" aria-labelledby="adm-download-label">
          <div className="adm-path">
            {/* A path never breaks (SPEC §3): one line, «…», full value in title. */}
            <output
              className="u-truncate"
              data-testid="download-dir"
              aria-label={t("admin.settings.downloadCurrent")}
              title={full}
            >
              {full}
            </output>
            <Folder size={16} aria-hidden="true" />
          </div>
          {info?.missing && (
            <span className="adm-warn" role="alert">
              {t("admin.settings.downloadMissing")}
            </span>
          )}
          <div className="adm-inline">
            <button
              type="button"
              className="adm-btn adm-btn--secondary"
              disabled={busy}
              onClick={() => void run(downloadDir.pick)}
            >
              <FolderOpen size={16} aria-hidden="true" />
              {t("admin.settings.downloadChoose")}
            </button>
            {info?.custom && (
              <button
                type="button"
                className="adm-btn adm-btn--ghost"
                disabled={busy}
                onClick={() => void run(downloadDir.reset)}
              >
                {t("admin.settings.downloadReset")}
              </button>
            )}
          </div>
        </div>
      )}
    </SettingsRow>
  );
}
