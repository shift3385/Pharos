import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  THEME_STORAGE_KEY,
  ThemeContext,
  type ThemeMode,
  type ThemePreference,
} from "./theme-context";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemMode(): ThemeMode {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches
    ? "dark"
    : "light";
}

/** Without a stored choice the app follows the system, as it always did. */
function getInitialPreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

/**
 * Applies the "Faro Nocturno" theme by writing `data-theme` on the root element
 * (which selects the token set in tokens.css) and persisting the choice. The
 * preference may be "system": then the mode follows `prefers-color-scheme`
 * live (Administración → General, SPEC §8).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(getInitialPreference);
  const [system, setSystem] = useState<ThemeMode>(systemMode);
  const theme = preference === "system" ? system : preference;

  useEffect(() => {
    if (preference !== "system" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystem(media.matches ? "dark" : "light");
    onChange();
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, [preference]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  }, [preference]);

  const setTheme = useCallback((mode: ThemeMode) => setPreference(mode), []);
  const toggleTheme = useCallback(
    () => setPreference(theme === "light" ? "dark" : "light"),
    [theme],
  );

  const value = useMemo(
    () => ({ theme, preference, toggleTheme, setTheme, setPreference }),
    [theme, preference, toggleTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
