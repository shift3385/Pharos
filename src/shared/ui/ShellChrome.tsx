import { useMemo, useState, type ReactNode } from "react";
import { ShellChromeContext } from "./useShellChrome";

/**
 * What a screen may ask of the shell around it (SPEC §7): today, hiding the
 * mobile top bar, section pills and bottom bar while Gherkin is edited, so the
 * code fills the screen and the keyword bar sits right above the keyboard
 * (`useHideMobileChrome`). `AppShell` provides it; it lives in
 * shared so modules never import the app layer.
 */
export function ShellChromeProvider({ children }: { children: ReactNode }) {
  const [mobileChromeHidden, setMobileChromeHidden] = useState(false);
  const value = useMemo(() => ({ mobileChromeHidden, setMobileChromeHidden }), [mobileChromeHidden]);
  return <ShellChromeContext.Provider value={value}>{children}</ShellChromeContext.Provider>;
}
