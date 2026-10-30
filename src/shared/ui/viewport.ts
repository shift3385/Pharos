import { createContext } from "react";

/** The redesign's three views (SPEC §2, amended 2026-10-30 by
 *  CAMBIO-vista-adaptativa): chosen by the width of the app's root container,
 *  not the window's. */
export type Breakpoint = "mobile" | "tablet" | "desktop";

/** Below 600 px: mobile (top and bottom bars). From 600 to 1279 px: tablet
 *  (84 px icon strip). From 1280 px: desktop (248 px collapsible sidebar). */
export const TABLET_MIN = 600;
export const DESKTOP_MIN = 1280;

export function bandFor(width: number): Breakpoint {
  if (width < TABLET_MIN) return "mobile";
  if (width < DESKTOP_MIN) return "tablet";
  return "desktop";
}

/** The current view; null outside a `ViewportProvider`. */
export const ViewportContext = createContext<Breakpoint | null>(null);
