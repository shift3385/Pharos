import { useContext } from "react";
import { ViewportContext, bandFor, type Breakpoint } from "./viewport";

export type { Breakpoint } from "./viewport";

/** The current view (mobile < 600 px ≤ tablet < 1280 px ≤ desktop), from the
 *  app root's `ViewportProvider`, measured on the app container. Outside a
 *  provider (isolated component tests) it falls back to the window width.
 *  CSS keys on the root's `data-viewport`; read this only when the DOM itself
 *  must differ (sidebar or bottom bar, dropdown or bottom sheet). */
export function useBreakpoint(): Breakpoint {
  const band = useContext(ViewportContext);
  return band ?? bandFor(window.innerWidth);
}
