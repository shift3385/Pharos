import { createContext } from "react";

export type ThemeMode = "light" | "dark";

export interface ThemeContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

export const THEME_STORAGE_KEY = "pharos.theme";

export const ThemeContext = createContext<ThemeContextValue | undefined>(
  undefined,
);
