import { useTranslation } from "react-i18next";
import { RotateCcw, Trash2 } from "lucide-react";

/**
 * Papelera (SPEC §8; RED-W3, wave 5). Nothing lists or restores deleted items
 * yet, so this is an honest «Próximamente»: no counter, no breakdown, and the
 * actions stay disabled with the reason in `title`. When W3 lands, «Vaciar
 * papelera» confirms with `ConfirmDialog variant="destructive"`.
 */
export function TrashSection() {
  const { t } = useTranslation();
  const soon = t("admin.trash.soonHint");
  return (
    <div className="adm-trash" role="group" aria-labelledby="adm-trash-title" data-testid="admin-trash">
      <span className="adm-trash__icon" aria-hidden="true">
        <Trash2 size={18} />
      </span>
      <div className="adm-trash__text">
        <span id="adm-trash-title" className="adm-label">
          {t("admin.trash.title")}
          <span className="adm-badge">{t("admin.trash.soon")}</span>
        </span>
        <span className="adm-hint">{t("admin.trash.desc")}</span>
      </div>
      <div className="adm-trash__actions">
        <button type="button" className="adm-btn adm-btn--secondary" disabled title={soon}>
          <RotateCcw size={16} aria-hidden="true" />
          {t("admin.trash.restore")}
        </button>
        <button type="button" className="adm-btn adm-btn--danger-outline" disabled title={soon}>
          <Trash2 size={16} aria-hidden="true" />
          {t("admin.trash.empty")}
        </button>
      </div>
    </div>
  );
}
