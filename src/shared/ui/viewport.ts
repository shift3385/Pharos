import { createContext } from "react";

/** The redesign's three views (SPEC §2, amended 2026-10-30 by
 *  CAMBIO-vista-adaptativa): chosen by the width of the app's root container,
 *  not the window's. */
export type Breakpoint = "mobile" | "tablet" | "desktop";

/** Below 640 px: mobile (top and bottom bars). From 640 to 1023 px: tablet
 *  (84 px icon strip). From 1024 px: desktop (248 px collapsible sidebar). */
export const TABLET_MIN = 640;
export const DESKTOP_MIN = 1024;

export function bandFor(width: number): Breakpoint {
  if (width < TABLET_MIN) return "mobile";
  if (width < DESKTOP_MIN) return "tablet";
  return "desktop";
}

/** The current view; null outside a `ViewportProvider`. */
export const ViewportContext = createContext<Breakpoint | null>(null);
