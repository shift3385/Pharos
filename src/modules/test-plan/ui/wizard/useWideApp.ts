import { useLayoutEffect, useState } from "react";

/** The plan's own threshold (SPEC §8): from 1360 px of app container the step
 *  list goes on the left. Measured like `ViewportProvider` measures the views
 *  (the `.viewport-root` container, not the window), so only one step
 *  navigation is ever rendered. */
export const RAIL_MIN = 1360;

const appWidth = () =>
  document.querySelector<HTMLElement>(".viewport-root")?.clientWidth || window.innerWidth;

export function useWideApp(min = RAIL_MIN): boolean {
  const [wide, setWide] = useState(() => appWidth() >= min);
  useLayoutEffect(() => {
    setWide(appWidth() >= min);
    const root = document.querySelector(".viewport-root");
    if (!root || typeof ResizeObserver === "undefined") return;
    // Same boolean → React skips the re-render.
    const observer = new ResizeObserver(([entry]) =>
      setWide((entry?.contentRect.width || appWidth()) >= min),
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [min]);
  return wide;
}
