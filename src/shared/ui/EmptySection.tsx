import { useTranslation } from "react-i18next";
import "./EmptySection.css";

interface EmptySectionProps {
  title: string;
  subtitle: string;
  /** Implementation phase that will fill this section (spec §16). */
  phase?: number;
}

/** Placeholder shown by module sections that are not implemented yet. */
export function EmptySection({ title, subtitle, phase }: EmptySectionProps) {
  const { t } = useTranslation();
  return (
    <section className="empty-section">
      <header className="empty-section__header">
        <h1>{title}</h1>
        <p className="empty-section__subtitle">{subtitle}</p>
      </header>
      <div className="empty-section__card">
        <span className="empty-section__beacon" aria-hidden="true">
          ⌖
        </span>
        <p className="empty-section__body">{t("section.emptyBody")}</p>
        {phase !== undefined && (
          <span className="empty-section__badge">
            {t("section.comingInPhase", { phase })}
          </span>
        )}
      </div>
    </section>
  );
}
