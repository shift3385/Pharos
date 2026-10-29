import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "./Dialog";
import type { DetectionRow } from "@shared/import/xlsx";
import "./ConfirmDialog.css";
import "./ImportReportModal.css";

/** Live detection + final report for an .xlsx import (plan or case). While
 *  parsing it shows a progress bar and the fields as they are detected; when
 *  done, the user can apply the result (nothing is persisted until they Save). */
export function ImportReportModal({
  title,
  parsing,
  done,
  total,
  rows,
  onApply,
  onCancel,
}: {
  title: string;
  parsing: boolean;
  done: number;
  total: number;
  rows: DetectionRow[];
  onApply: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const ratio = total > 0 ? Math.round((done / total) * 100) : 0;
  const icon: Record<DetectionRow["status"], string> = {
    filled: "✓",
    empty: "○",
    notFound: "—",
  };

  return (
    <Dialog className="cd imp" labelledBy={`${id}-title`} onClose={onCancel}>
      <h3 id={`${id}-title`} className="cd__title">
        {title}
      </h3>

      <div
        className="imp__progress"
        role="progressbar"
        aria-labelledby={`${id}-title`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ratio}
      >
        <div className="imp__bar" style={{ width: `${ratio}%` }} />
      </div>
      <p className="imp__status" role="status">
        {parsing
          ? t("importReport.detecting", { done, total })
          : t("importReport.doneMsg")}
      </p>

      <ul className="imp__list">
        {rows.map((r, i) => (
          <li key={i} className="imp__row" data-status={r.status}>
            <span className="imp__icon" aria-hidden="true">{icon[r.status]}</span>
            <span className="imp__label">{t(r.labelKey)}</span>
            <span className="imp__value">
              {r.status === "notFound"
                ? t("importReport.notFound")
                : r.count != null
                  ? t("importReport.rows", { count: r.count })
                  : (r.preview ?? t("importReport.blank"))}
            </span>
          </li>
        ))}
      </ul>

      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          onClick={onApply}
          disabled={parsing}
        >
          {t("importReport.apply")}
        </button>
      </div>
    </Dialog>
  );
}
