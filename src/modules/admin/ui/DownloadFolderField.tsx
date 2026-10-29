import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { downloadDir, type DownloadDirInfo } from "@shared/export/saveFile";
import { useToast } from "@shared/ui/Toast";

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

  useEffect(() => {
    if (available) void downloadDir.get().then(setInfo);
  }, [available]);

  async function run(action: () => Promise<DownloadDirInfo | null>) {
    setBusy(true);
    try {
      const next = await action();
      if (next) {
        setInfo(next);
        toast(t("admin.saved"));
      }
    } finally {
      setBusy(false);
    }
  }

  const shown = info?.path ?? "";
  return (
    <div
      className="adm__field"
      role="group"
      aria-labelledby="adm-download-label"
    >
      <span id="adm-download-label" className="adm__label">
        {t("admin.settings.download")}
      </span>
      {available ? (
        <>
          <output
            className="adm__path"
            data-testid="download-dir"
            aria-label={t("admin.settings.downloadCurrent")}
          >
            {shown || "—"}
            {info &&
              !info.custom &&
              ` (${t("admin.settings.downloadDefault")})`}
          </output>
          {info?.missing && (
            <span className="adm__warn" role="alert">
              {t("admin.settings.downloadMissing")}
            </span>
          )}
          <div className="adm__bg-row">
            <button
              type="button"
              className="adm__btn"
              disabled={busy}
              onClick={() => void run(downloadDir.pick)}
            >
              {t("admin.settings.downloadChoose")}
            </button>
            {info?.custom && (
              <button
                type="button"
                className="adm__btn"
                disabled={busy}
                onClick={() => void run(downloadDir.reset)}
              >
                {t("admin.settings.downloadReset")}
              </button>
            )}
          </div>
          <span className="adm__hint">{t("admin.settings.downloadHint")}</span>
        </>
      ) : (
        <span className="adm__hint">{t("admin.settings.downloadWebHint")}</span>
      )}
    </div>
  );
}
