import { useMemo, useState, type ReactNode } from "react";
import { ShellChromeContext } from "./useShellChrome";

/**
 * What a screen may ask of the shell around it (SPEC §7): today, hiding the
 * mobile bottom bar while Gherkin is edited, so the keyword bar sits right
 * above the keyboard (`useHideBottomBar`). `AppShell` provides it; it lives in
 * shared so modules never import the app layer.
 */
export function ShellChromeProvider({ children }: { children: ReactNode }) {
  const [bottomBarHidden, setBottomBarHidden] = useState(false);
  const value = useMemo(() => ({ bottomBarHidden, setBottomBarHidden }), [bottomBarHidden]);
  return <ShellChromeContext.Provider value={value}>{children}</ShellChromeContext.Provider>;
}
