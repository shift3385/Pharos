import { createContext, useContext, useEffect } from "react";

export interface ShellChrome {
  /** The mobile top bar, section pills and bottom bar are hidden. */
  mobileChromeHidden: boolean;
  setMobileChromeHidden: (hidden: boolean) => void;
}

/** What a screen may ask of the shell around it (see `ShellChromeProvider`).
 *  Outside a provider it does nothing. */
export const ShellChromeContext = createContext<ShellChrome>({
  mobileChromeHidden: false,
  setMobileChromeHidden: () => {},
});

export function useShellChrome(): ShellChrome {
  return useContext(ShellChromeContext);
}

/** Hides the mobile top bar, section pills and bottom bar while `active`
 *  (full-screen Gherkin editing, SPEC §7/§8), and shows them again after. */
export function useHideMobileChrome(active: boolean) {
  const { setMobileChromeHidden } = useShellChrome();
  useEffect(() => {
    if (!active) return;
    setMobileChromeHidden(true);
    return () => setMobileChromeHidden(false);
  }, [active, setMobileChromeHidden]);
}
