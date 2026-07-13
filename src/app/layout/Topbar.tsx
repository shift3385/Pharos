import { ThemeToggle } from "@shared/theme/ThemeToggle";
import { LanguageToggle } from "@shared/i18n/LanguageToggle";

/** Top bar holding the global language and theme controls. */
export function Topbar() {
  return (
    <header className="topbar">
      <div className="topbar__spacer" />
      <div className="topbar__actions">
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}
