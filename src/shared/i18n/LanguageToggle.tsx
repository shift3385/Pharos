import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type Language } from "./index";
import "./LanguageToggle.css";

/** Segmented control to switch the UI language (spec §11). */
export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? "es") as Language;

  return (
    <div
      className="lang-toggle"
      role="group"
      aria-label={t("topbar.language")}
    >
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          className="lang-toggle__option"
          data-active={current === lng}
          aria-pressed={current === lng}
          onClick={() => void i18n.changeLanguage(lng)}
          data-testid={`lang-${lng}`}
        >
          {t(`language.${lng}`)}
        </button>
      ))}
    </div>
  );
}
