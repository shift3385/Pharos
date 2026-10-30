import { useSyncExternalStore } from "react";

/** The redesign's three layouts (SPEC §2): below 600 px the mobile bars, from
 *  600 to 1279 px the 84 px icon strip, from 1280 px the full sidebar. */
export type Breakpoint = "mobile" | "tablet" | "desktop";

export const MOBILE_QUERY = "(max-width: 599.98px)";
export const TABLET_QUERY = "(min-width: 600px) and (max-width: 1279.98px)";

function query(q: string): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(q)
    : null;
}

/** Reads the current breakpoint synchronously (so the first render already
 *  shows the right navigation, with no flash). Without `matchMedia` (tests
 *  that do not stub it) it is the desktop. */
export function readBreakpoint(): Breakpoint {
  if (query(MOBILE_QUERY)?.matches) return "mobile";
  if (query(TABLET_QUERY)?.matches) return "tablet";
  return "desktop";
}

function subscribe(onChange: () => void) {
  const lists = [query(MOBILE_QUERY), query(TABLET_QUERY)].filter(
    (l): l is MediaQueryList => l !== null,
  );
  lists.forEach((l) => l.addEventListener("change", onChange));
  return () => lists.forEach((l) => l.removeEventListener("change", onChange));
}

/** The current breakpoint, updated when the window crosses 600 or 1280 px. CSS
 *  media queries use the same limits; read this only when the DOM itself must
 *  differ (e.g. a bottom sheet instead of a dropdown). */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, readBreakpoint, () => "desktop");
}
