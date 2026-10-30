import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ViewportContext, bandFor, type Breakpoint } from "./viewport";

/** Width of the root container; before layout (or where there is none, as in
 *  jsdom) it is 0, and then the window is the best estimate. */
function widthOf(el: HTMLElement | null): number {
  return el?.clientWidth || window.innerWidth;
}

/**
 * Root of the app (above the routes, so the sign-in screen gets it too). It
 * measures its own width and provides the view through `useBreakpoint`
 * (SPEC §2 as amended by CAMBIO-vista-adaptativa):
 * - a `ResizeObserver` on this container, not on `window`, so the app also
 *   adapts when it is embedded or its pane is resized;
 * - the first value is measured synchronously before the first paint, so the
 *   navigation never flashes in the wrong layout;
 * - consumers re-render only when the band changes, and the observer is
 *   disconnected on unmount.
 * The container also carries `data-viewport` for CSS (mirrored on `<html>`
 * for portaled dialogs) and is the size container (`container-type:
 * inline-size`) that `cqi` units resolve against.
 */
export function ViewportProvider({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [band, setBand] = useState<Breakpoint>(() => bandFor(widthOf(null)));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setBand(bandFor(widthOf(el)));
    if (typeof ResizeObserver === "undefined") return;
    // Same band → same string → React skips the re-render.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBand(bandFor(entry.contentRect.width || widthOf(el)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Mirrored on <html> for what is portaled out of the root (dialogs, sheets).
  useLayoutEffect(() => {
    document.documentElement.dataset.viewport = band;
  }, [band]);
  useLayoutEffect(() => () => void delete document.documentElement.dataset.viewport, []);

  return (
    <div ref={ref} className="viewport-root" data-viewport={band}>
      <ViewportContext.Provider value={band}>{children}</ViewportContext.Provider>
    </div>
  );
}
