import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "./Dialog";
import "./ConfirmDialog.css";

/** Modal confirmation for high-impact actions (e.g. deleting a project and all
 *  its content). Escape, a click outside or Cancel dismisses it; the focus
 *  starts on Cancel, the safe choice. */
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
  const id = useId();
  return (
    <Dialog
      role="alertdialog"
      labelledBy={`${id}-title`}
      describedBy={`${id}-msg`}
      onClose={onCancel}
    >
      <h3 id={`${id}-title`} className="cd__title">
        {title}
      </h3>
      <p id={`${id}-msg`} className="cd__msg">
        {message}
      </p>
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
    </Dialog>
  );
}
