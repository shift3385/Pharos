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
        <LanguageToggle />
        <ThemeToggle />
        {user && (
          <div className="topbar__user">
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
