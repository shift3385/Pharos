import { useTranslation } from "react-i18next";
import { RotateCw } from "lucide-react";
import type { MetricsState } from "./model/loadHomeMetrics";

/** What an execution widget says while its numbers load or after they fail
 *  (RED-W6): «Cargando…» or the error with «Reintentar». Nothing once ready. */
export function MetricsNotice({
  state,
  onRetry,
  className = "",
}: {
  state: MetricsState;
  onRetry: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  if (state.status === "ready") return null;
  if (state.status === "loading")
    return (
      <p className={`home-note ${className}`} role="status">
        {t("dashboard.metrics.loading")}
      </p>
    );
  return (
    <div className={`home-error ${className}`} role="alert">
      <span>{t("dashboard.metrics.error")}</span>
      <button
        type="button"
        className="home-link home-link--strong home-error__retry"
        onClick={onRetry}
      >
        <RotateCw size={14} aria-hidden="true" />
        {t("dashboard.metrics.retry")}
      </button>
    </div>
  );
}
