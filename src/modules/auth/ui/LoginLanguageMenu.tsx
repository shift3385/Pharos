import { ChevronDown, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type Language } from "@shared/i18n";
import { MenuItem, ResponsiveMenu } from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { useBreakpoint } from "@shared/ui/useBreakpoint";

/** Language selector of the Login (SPEC §8): «Español ▾» opens the languages
 *  as a menu, or as a bottom sheet on mobile. Signed in, the language lives in
 *  the user menu instead. `onNavy` styles it for the mobile photo header. */
export function LoginLanguageMenu({ onNavy = false }: { onNavy?: boolean }) {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? "es") as Language;
  const menu = usePopover(useBreakpoint() === "mobile" ? "dialog" : "menu");

  return (
    <>
      <button
        type="button"
        className={`auth-lang${onNavy ? " auth-lang--navy" : ""}`}
        {...menu.triggerProps}
        data-testid="login-language"
      >
        <Languages size={14} aria-hidden="true" />
        {/* Named by its content with a hidden prefix, so the visible language
            stays in the accessible name (WCAG 2.5.3). */}
        <span className="sr-only">{t("auth.languageLabel")}: </span>
        <span>{t(`language.${current}`)}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <ResponsiveMenu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={t("auth.languageLabel")}
        title={t("auth.languageLabel")}
        placement={onNavy ? "bottom-end" : "top-start"}
      >
        {SUPPORTED_LANGUAGES.map((lng) => (
          <MenuItem
            key={lng}
            selected={current === lng}
            testId={`lang-${lng}`}
            onSelect={() => void i18n.changeLanguage(lng)}
          >
            {t(`language.${lng}`)}
          </MenuItem>
        ))}
      </ResponsiveMenu>
    </>
  );
}
