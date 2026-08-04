import { useTranslation } from "react-i18next";
import "@shared/ui/ConfirmDialog.css";
import type { DetectionRow } from "../import/planImport";
import "./TestPlan.css";

/** Live detection + final report for a plan .xlsx import. While parsing it shows
 *  a progress bar and the fields as they are detected; when done, the user can
 *  apply the result to the wizard (nothing is persisted until they Save). */
export function ImportReportModal({
  fileName,
  parsing,
  done,
  total,
  rows,
  onApply,
  onCancel,
}: {
  fileName: string;
  parsing: boolean;
  done: number;
  total: number;
  rows: DetectionRow[];
  onApply: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const ratio = total > 0 ? Math.round((done / total) * 100) : 0;
  const icon: Record<DetectionRow["status"], string> = {
    filled: "✓",
    empty: "○",
    notFound: "—",
  };

  return (
    <div className="cd-overlay" role="dialog" aria-modal="true">
      <div className="cd tp-import">
        <h3 className="cd__title">{t("testPlan.import.title")}</h3>
        <p className="cd__msg">{fileName}</p>

        <div className="tp-import__progress" role="progressbar" aria-valuenow={ratio}>
          <div className="tp-import__bar" style={{ width: `${ratio}%` }} />
        </div>
        <p className="tp-import__status">
          {parsing ? t("testPlan.import.detecting", { done, total }) : t("testPlan.import.doneMsg")}
        </p>

        <ul className="tp-import__list">
          {rows.map((r, i) => (
            <li key={i} className="tp-import__row" data-status={r.status}>
              <span className="tp-import__icon">{icon[r.status]}</span>
              <span className="tp-import__label">{t(r.labelKey)}</span>
              <span className="tp-import__value">
                {r.status === "notFound"
                  ? t("testPlan.import.notFound")
                  : r.count != null
                    ? t("testPlan.import.rows", { count: r.count })
                    : r.preview ?? t("testPlan.import.blank")}
              </span>
            </li>
          ))}
        </ul>

        <div className="cd__actions">
          <button type="button" className="cd__cancel" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className="cd__confirm" onClick={onApply} disabled={parsing}>
            {t("testPlan.import.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
