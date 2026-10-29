import { useTranslation } from "react-i18next";
import type { AiFailure } from "../api/structured";
import "./Assist.css";

/** Why an AI answer was not used, and that nothing was applied (ADR-0023). The
 *  details (the model's own words, the failed fields, the provider's message)
 *  are plain text. */
export function AiFailureNotice({ failure }: { failure: AiFailure }) {
  const { t } = useTranslation();
  return (
    <div className="assist__message assist__failure" role="alert">
      <p>⚠ {t(`ai.structured.error.${failure.kind}`)}</p>
      {failure.details.length > 0 && (
        <ul className="assist__details">
          {failure.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      <p className="assist__nothing">{t("ai.structured.nothingApplied")}</p>
    </div>
  );
}
