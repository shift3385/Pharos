import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { unlessReported } from "@shared/ui/notify";
import {
  discardLegacyLeftovers,
  downloadLegacyLeftovers,
  legacyLeftovers,
  leftoverCount,
  type LegacyLeftovers,
} from "../web/legacyWebData";

/** Web only (BASE-10): what an older web version left in this browser and the
 *  server did not take. It stays until the user downloads it and says so, or
 *  discards it; a browser download alone cannot tell it was saved. */
export function LegacyUnsentNotice() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [leftovers, setLeftovers] = useState<LegacyLeftovers | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const load = () => void legacyLeftovers().then(setLeftovers);
    load();
    window.addEventListener("pharos:legacy-unsent", load);
    return () => window.removeEventListener("pharos:legacy-unsent", load);
  }, [user?.id]);

  if (!leftovers || leftoverCount(leftovers) === 0) return null;
  const count = leftoverCount(leftovers);
  const downloaded = Boolean(leftovers.downloadedAt);
  return (
    <>
      <span className="sync__label" role="status">
        {t("sync.web.legacyNotice", { count })}
      </span>
      <button type="button" className="sync__btn" onClick={() => void unlessReported(downloadLegacyLeftovers())}>
        {t("sync.web.legacyDownload")}
      </button>
      <button type="button" className="sync__btn" onClick={() => setConfirming(true)}>
        {t(downloaded ? "sync.web.legacySaved" : "sync.web.legacyDiscard")}
      </button>
      {confirming && (
        <ConfirmDialog
          title={t("sync.web.legacyDiscardTitle")}
          message={t(downloaded ? "sync.web.legacySavedConfirm" : "sync.web.legacyDiscardConfirm", { count })}
          confirmLabel={t(downloaded ? "sync.web.legacySaved" : "sync.web.legacyDiscard")}
          danger={!downloaded}
          onConfirm={() => {
            setConfirming(false);
            void discardLegacyLeftovers();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
