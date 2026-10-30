import { createContext, useContext, useEffect } from "react";

export interface ShellChrome {
  bottomBarHidden: boolean;
  setBottomBarHidden: (hidden: boolean) => void;
}

/** What a screen may ask of the shell around it (see `ShellChromeProvider`).
 *  Outside a provider it does nothing. */
export const ShellChromeContext = createContext<ShellChrome>({
  bottomBarHidden: false,
  setBottomBarHidden: () => {},
});

export function useShellChrome(): ShellChrome {
  return useContext(ShellChromeContext);
}

/** Hides the mobile bottom bar while `active`, and shows it again after. */
export function useHideBottomBar(active: boolean) {
  const { setBottomBarHidden } = useShellChrome();
  useEffect(() => {
    if (!active) return;
    setBottomBarHidden(true);
    return () => setBottomBarHidden(false);
  }, [active, setBottomBarHidden]);
}
