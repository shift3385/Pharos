import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the system asks for less motion (or there is no `matchMedia`,
 *  as in tests, matching `useSidebarToggle`): animations then give way to a
 *  static change of state (UX-26). Follows the setting live. */
export function useReducedMotion(): boolean {
  const supported =
    typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [reduced, setReduced] = useState(
    () => !supported || window.matchMedia(QUERY).matches,
  );
  useEffect(() => {
    if (!supported) return;
    const media = window.matchMedia(QUERY);
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [supported]);
  return reduced;
}
