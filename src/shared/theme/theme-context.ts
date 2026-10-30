import { createContext } from "react";

export type ThemeMode = "light" | "dark";
/** What the user chose: a fixed mode or «Según el sistema» (SPEC §8, Tema). */
export type ThemePreference = ThemeMode | "system";

export interface ThemeContextValue {
  /** The resolved mode on screen (a "system" preference follows the OS). */
  theme: ThemeMode;
  preference: ThemePreference;
  toggleTheme: () => void;
  /** Fixes an explicit mode (the topbar's moon/sun does this). */
  setTheme: (mode: ThemeMode) => void;
  setPreference: (preference: ThemePreference) => void;
}

export const THEME_STORAGE_KEY = "pharos.theme";

export const ThemeContext = createContext<ThemeContextValue | undefined>(
  undefined,
);
