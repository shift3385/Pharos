import { useTranslation } from "react-i18next";
import "./ConfirmDialog.css";

/** Modal confirmation for high-impact actions (e.g. deleting a project and all
 *  its content). Click outside or Cancel dismisses it. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="cd-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="cd" onClick={(e) => e.stopPropagation()}>
        <h3 className="cd__title">{title}</h3>
        <p className="cd__msg">{message}</p>
        <div className="cd__actions">
          <button type="button" className="cd__cancel" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className={`cd__confirm${danger ? " cd__confirm--danger" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
