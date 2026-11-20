import { useId } from "react";
import { parseStamp } from "@shared/time/stamp";
import { useTranslation } from "react-i18next";
import { Dialog } from "./Dialog";
import { preview, type DetectionRow } from "@shared/import/xlsx";
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
  const { t, i18n } = useTranslation();
  const id = useId();
  // A detected date reads as the app writes dates («16 nov 2026»), not in ISO
  // (FIX-46).
  const shown = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v)
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeZone: "UTC" }).format(parseStamp(`${v} 00:00`))
      : v;
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

      <ul className="imp__list u-scroll-fade">
        {rows.map((r, i) => {
          const value =
            r.status === "notFound"
              ? t("importReport.notFound")
              : r.count != null
                ? t("importReport.rows", { count: r.count })
                : r.previewKey
                  ? t(r.previewKey)
                  : r.previewItems?.length
                    ? preview(r.previewItems.map((it) => (it.key ? t(it.key, { defaultValue: it.text }) : it.text)).join(", "))
                    : r.preview
                      ? shown(r.preview)
                      : t("importReport.blank");
          return (
            <li key={i} className="imp__row" data-status={r.status}>
              <span className="imp__icon" aria-hidden="true">{icon[r.status]}</span>
              <span className="imp__label">{t(r.labelKey)}</span>
              <span className="imp__value" title={value}>
                {value}
              </span>
            </li>
          );
        })}
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
