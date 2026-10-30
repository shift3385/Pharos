import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

/**
 * Asks before unsaved edits are lost by leaving the case editor some other way
 * than its own buttons (which ask themselves). The app uses a HashRouter, which
 * has no navigation blocker, so while `active` it:
 * - catches clicks on in-app links anywhere (sidebar, section pills,
 *   breadcrumbs) and asks before following them;
 * - keeps a copy of the current history entry on top, so the system/Android
 *   «Atrás» lands on it: it asks, and only goes back if the user discards
 *   (after saving, that copy stays: one «Atrás» then stays on the case);
 * - asks the browser to confirm a reload or closing the window.
 * `ask(go)` shows the «Descartar cambios» dialog and runs `go` on confirm.
 */
export function useUnsavedGuard(active: boolean, ask: (go: () => void) => void) {
  const navigate = useNavigate();
  const askRef = useRef(ask);
  askRef.current = ask;
  const armed = useRef(false);

  useEffect(() => {
    if (!active) return;
    armed.current = true;

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("#/") && !href.startsWith("/")) return;
      const to = href.replace(/^#/, "");
      e.preventDefault();
      e.stopPropagation();
      askRef.current(() => {
        armed.current = false;
        // Replaces the guard's extra entry, so «Atrás» returns to the case.
        navigate(to, { replace: true });
      });
    };

    const keep = () => window.history.pushState(window.history.state, "", window.location.href);
    keep();
    const onPop = () => {
      if (!armed.current) return;
      keep();
      askRef.current(() => {
        armed.current = false;
        window.history.go(-2);
      });
    };

    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", onUnload);
      // The extra entry stays: it has the same address, so one «Atrás» after
      // saving stays on the case. Popping it here would race the page's own
      // URL changes (a new case gets its id right after saving).
      armed.current = false;
    };
  }, [active, navigate]);
}
