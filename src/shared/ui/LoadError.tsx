import { useTranslation } from "react-i18next";
import { RotateCw } from "lucide-react";
import "./headerActions.css";
import "./loadError.css";

/**
 * A read or an action that failed against a real error (API down, 5xx): says
 * so with a «Reintentar» button, instead of leaving «Cargando…» on screen or
 * an empty list that looks like no data. `role="alert"` announces it.
 */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="ui-load-error" role="alert">
      <span>{message}</span>
      <button type="button" className="header-action" onClick={onRetry}>
        <RotateCw size={16} aria-hidden="true" />
        <span>{t("common.retry")}</span>
      </button>
    </div>
  );
}
