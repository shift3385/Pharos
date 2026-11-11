import { useTranslation } from "react-i18next";
import { RotateCw } from "lucide-react";
import type { MetricsState } from "./model/loadHomeMetrics";

/** What an execution widget says after its numbers fail (RED-W6): the error
 *  with «Reintentar». Nothing otherwise: while they load the widget shows its
 *  placeholders and the Home says it once, in its header. */
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
  if (state.status !== "error") return null;
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
