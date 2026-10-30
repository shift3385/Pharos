import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "./Dialog";
import "./ConfirmDialog.css";

/** Modal confirmation for high-impact actions (e.g. deleting a project and all
 *  its content). The focus starts on Cancel, the safe choice.
 *
 *  - `variant="default"`: Escape, a click outside or Cancel dismisses it.
 *  - `variant="destructive"` (SPEC §6/§10): only «Cancelar» closes it — Escape
 *    and the backdrop do nothing — and the confirm button is solid error red.
 *  - `confirmText`: the confirm button stays disabled until the user types this
 *    exact text (e.g. the project prefix) in the field the dialog shows. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  variant = "default",
  confirmText,
  children,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  /** The safe choice's text; «Cancelar» by default. */
  cancelLabel?: string;
  /** Error-coloured confirm button; implied by `variant="destructive"`. */
  danger?: boolean;
  variant?: "default" | "destructive";
  confirmText?: string;
  /** Extra content between the message and the actions (e.g. what is lost). */
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [typed, setTyped] = useState("");
  const destructive = variant === "destructive";
  const blocked = confirmText !== undefined && typed.trim() !== confirmText;
  return (
    <Dialog
      role="alertdialog"
      labelledBy={`${id}-title`}
      describedBy={`${id}-msg`}
      onClose={onCancel}
      dismissable={!destructive}
      className={`cd${destructive ? " cd--destructive" : ""}`}
    >
      <h3 id={`${id}-title`} className="cd__title">
        {title}
      </h3>
      <p id={`${id}-msg`} className="cd__msg">
        {message}
      </p>
      {children}
      {confirmText !== undefined && (
        <label className="cd__type">
          <span>{t("dialog.typeToConfirm", { text: confirmText })}</span>
          <input
            className="cd__type-input"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
      )}
      <div className="cd__actions">
        <button
          type="button"
          className="cd__cancel"
          autoFocus={confirmText === undefined}
          onClick={onCancel}
        >
          {cancelLabel ?? t("common.cancel")}
        </button>
        <button
          type="button"
          className={`cd__confirm${danger || destructive ? " cd__confirm--danger" : ""}`}
          disabled={blocked}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
