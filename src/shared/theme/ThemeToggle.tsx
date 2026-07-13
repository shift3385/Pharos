import { useTranslation } from "react-i18next";
import { useTheme } from "./useTheme";
import "./ThemeToggle.css";

/** Switches between the light and dark variants of "Faro Nocturno". */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={t("topbar.toggleTheme")}
      title={t("topbar.toggleTheme")}
      data-testid="theme-toggle"
    >
      <span aria-hidden="true">{isDark ? "☾" : "☀"}</span>
      <span className="theme-toggle__label">
        {isDark ? t("theme.dark") : t("theme.light")}
      </span>
    </button>
  );
}
