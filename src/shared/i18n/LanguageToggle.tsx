import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type Language } from "./index";
import "./LanguageToggle.css";

/** Compact language dropdown ("ES ▾") that opens the available languages
 *  (spec §11). Keeps the existing i18n logic; only the markup changed. */
export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? "es") as Language;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (lng: Language) => {
    void i18n.changeLanguage(lng);
    setOpen(false);
  };

  return (
    <div className="lang-dd" ref={ref}>
      <button
        type="button"
        className="lang-dd__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("topbar.language")}
        data-testid="lang-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        {current.toUpperCase()}
        <span className="lang-dd__chev" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul className="lang-dd__menu" role="listbox">
          {SUPPORTED_LANGUAGES.map((lng) => (
            <li key={lng} role="option" aria-selected={current === lng}>
              <button
                type="button"
                className="lang-dd__item"
                data-active={current === lng}
                data-testid={`lang-${lng}`}
                onClick={() => pick(lng)}
              >
                {t(`language.${lng}`)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
