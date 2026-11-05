import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RunDeletePreview } from "@shared/contracts/contract";
import { Dialog } from "@shared/ui/Dialog";
import { loadSettings } from "@modules/admin";
import { runsApi } from "../api/runsApi";
import "@shared/ui/ConfirmDialog.css";
import "./Runs.css";

/** «Borrar run» (EJE-07): names what the delete hides before it happens. The
 *  run and its items become tombstones; its results are never deleted by
 *  hand: the purge takes them with the run after the Administration
 *  retention. A run of a closed cycle cannot be deleted. */
export function DeleteRunDialog({
  runId,
  userId,
  onCancel,
  onDeleted,
}: {
  runId: string;
  userId: string;
  onCancel: () => void;
  onDeleted: (runKey: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [preview, setPreview] = useState<RunDeletePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    runsApi
      .deletePreview(runId, userId)
      .then((p) => live && setPreview(p))
      .catch((e) => {
        if (!live) return;
        const raw = String(e instanceof Error ? e.message : e);
        setError(raw.startsWith("run-deleted") ? t("execution.error.runDeleted") : t("execution.error.generic"));
      });
    return () => {
      live = false;
    };
  }, [runId, userId, t]);

  const closedCycle = preview?.cycle?.closed === true;

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    try {
      await runsApi.delete(runId, userId);
      onDeleted(preview.runKey);
    } catch (e) {
      const raw = String(e instanceof Error ? e.message : e);
      setError(
        raw.startsWith("cycle-closed")
          ? t("execution.error.cycleClosed")
          : raw.startsWith("run-deleted")
            ? t("execution.error.runDeleted")
            : t("execution.error.generic"),
      );
      setBusy(false);
    }
  }

  return (
    <Dialog className="cd rn-modal" labelledBy={`${id}-t`} onClose={onCancel}>
      <h3 id={`${id}-t`} className="cd__title">
        {t("execution.run.deleteTitle")}
      </h3>
      <p className="tp-field__hint" role="status" aria-live="polite">
        {preview === null && !error ? t("common.loading") : ""}
      </p>
      {preview && (
        <>
          <p className="cd__msg">
            {t("execution.run.deleteMessage", { key: preview.runKey, title: preview.title })}
          </p>
          <ul className="rn-warnings" data-testid="run-delete-hidden">
            <li>{t("execution.run.deleteItems", { count: preview.items })}</li>
            <li>
              {t("execution.run.deleteResults", { count: preview.results })}
              {preview.imports > 0 && ` ${t("execution.run.deleteImports", { count: preview.imports })}`}
            </li>
            {preview.attachments > 0 && (
              <li>{t("execution.run.deleteAttachments", { count: preview.attachments })}</li>
            )}
            {preview.drafts > 0 && (
              <li className="rn-warn">{t("execution.run.deleteDrafts", { count: preview.drafts })}</li>
            )}
            {preview.cycle && !closedCycle && (
              <li className="rn-warn">
                {t("execution.run.deleteCycle", { key: preview.cycle.cycleKey, title: preview.cycle.title })}
              </li>
            )}
            {preview.linkedDefects > 0 && (
              <li className="rn-warn">
                {t("execution.run.deleteDefects", { count: preview.linkedDefects })}
              </li>
            )}
          </ul>
          {closedCycle ? (
            <p className="cd__msg rn-warn" role="alert" data-testid="run-delete-cycle-closed">
              {t("execution.run.deleteCycleClosed", { key: preview.cycle?.cycleKey ?? "" })}
            </p>
          ) : (
            <p className="cd__msg">
              {t("execution.run.deletePurge", { days: loadSettings().retentionDays })}
            </p>
          )}
        </>
      )}
      {error && (
        <p className="cd__msg rn-warn" role="alert">
          {error}
        </p>
      )}
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm cd__confirm--danger"
          disabled={!preview || closedCycle || busy}
          onClick={() => void confirm()}
          data-testid="run-delete-confirm"
        >
          {t("execution.run.delete")}
        </button>
      </div>
    </Dialog>
  );
}
