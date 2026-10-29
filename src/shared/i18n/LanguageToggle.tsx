import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type Language } from "./index";
import "./LanguageToggle.css";

/** Compact language dropdown ("ES ▾") that opens the available languages
 *  (spec §11). It is a disclosure: the trigger's name starts with the visible
 *  code (WCAG 2.5.3), the menu is a named list of buttons with the current one
 *  pressed, and Escape closes it and returns the focus to the trigger. */
export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? "es") as Language;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (lng: Language) => {
    void i18n.changeLanguage(lng);
    setOpen(false);
  };

  return (
    <div className="lang-dd" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="lang-dd__trigger"
        aria-expanded={open}
        aria-controls="lang-dd-menu"
        aria-label={`${current.toUpperCase()}, ${t("topbar.language")}`}
        data-testid="lang-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        {current.toUpperCase()}
        <span className="lang-dd__chev" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul id="lang-dd-menu" className="lang-dd__menu" aria-label={t("topbar.language")}>
          {SUPPORTED_LANGUAGES.map((lng) => (
            <li key={lng}>
              <button
                type="button"
                className="lang-dd__item"
                data-active={current === lng}
                aria-pressed={current === lng}
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
