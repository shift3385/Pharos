import { useTranslation } from "react-i18next";
import { ThemeToggle } from "@shared/theme/ThemeToggle";
import { LanguageToggle } from "@shared/i18n/LanguageToggle";
import { useAuth } from "@modules/auth";

/** Top bar: offline indicator, global language/theme controls, and user menu. */
export function Topbar() {
  const { t } = useTranslation();
  const { user, offline, logout } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar__spacer" />
      <div className="topbar__actions">
        {offline && (
          <span className="topbar__offline" title={t("auth.offline")}>
            ● {t("auth.offline")}
          </span>
        )}
        <ThemeToggle />
        <LanguageToggle />
        {user && (
          <div className="topbar__user">
            <span className="topbar__user-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
              </svg>
            </span>
            <span className="topbar__user-name">{user.displayName}</span>
            <button
              type="button"
              className="topbar__logout"
              onClick={() => void logout()}
            >
              {t("auth.logout")}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
