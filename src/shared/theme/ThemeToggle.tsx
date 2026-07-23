import { useTranslation } from "react-i18next";
import { useTheme } from "./useTheme";
import type { ThemeMode } from "./theme-context";
import "./ThemeToggle.css";

const MODES: { mode: ThemeMode; glyph: string; labelKey: string }[] = [
  { mode: "light", glyph: "☀", labelKey: "theme.light" },
  { mode: "dark", glyph: "☾", labelKey: "theme.dark" },
];

/** Segmented pill for the "Faro Nocturno" light/dark variants: the active mode
 *  gets the brand accent, the inactive one is muted. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <div className="theme-seg" role="group" aria-label={t("topbar.toggleTheme")}>
      {MODES.map(({ mode, glyph, labelKey }) => {
        const active = theme === mode;
        return (
          <button
            key={mode}
            type="button"
            className="theme-seg__btn"
            data-active={active}
            aria-pressed={active}
            aria-label={t(labelKey)}
            title={t(labelKey)}
            // The inactive segment keeps the legacy test id: clicking it flips.
            data-testid={active ? `theme-${mode}` : "theme-toggle"}
            onClick={() => setTheme(mode)}
          >
            <span aria-hidden="true">{glyph}</span>
          </button>
        );
      })}
    </div>
  );
}
