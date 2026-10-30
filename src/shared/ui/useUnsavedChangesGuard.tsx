import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useBlocker, useLocation, type BlockerFunction, type Location } from "react-router";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "./ConfirmDialog";

export interface UnsavedChangesOptions {
  /** Replaces the dialog's default text. */
  message?: string;
  /** Navigations that do not count as leaving: `true` lets every change of
   *  only the query string through (filters, `?tab=` with replace); a
   *  function decides per navigation. By default any change of the path or
   *  the query string asks (e.g. `?case=` opens another case). */
  ignore?: boolean | ((current: Location, next: Location) => boolean);
}

// React Router keeps one blocker per router: the last one registered wins.
// Screens never show two guards at once; this count catches it in development.
let mounted = 0;

/**
 * Asks before unsaved changes are lost (RED-V3k, ADR-0028 §9). While `dirty`:
 * - any navigation that changes the address (links, the sidebar, section
 *   pills, `navigate`, `setSearchParams`, and the system/Android «Atrás») is
 *   held by the router (`useBlocker`, which needs the data router of
 *   `main.tsx`) until the user picks «Descartar cambios» or «Seguir editando»;
 * - reloading or closing the window asks the browser to confirm
 *   (`beforeunload`).
 *
 * **One per screen:** React Router keeps a single blocker per router, so only
 * one mounted component may call this hook at a time (the screen that owns
 * the form). Sub-forms report their changes to it instead of calling it.
 *
 * Render the returned `dialog`. A navigation the screen starts on purpose
 * while still dirty (e.g. opening a new case by its id right after saving,
 * possibly after an `await`) goes through `bypass(go)`: the next location
 * change is let through, sync or async, `navigate(-1)` included. The bypass
 * ends at that location change, or when the form becomes dirty again.
 * If the screen turns clean while a navigation is held, it proceeds.
 */
export function useUnsavedChangesGuard(
  dirty: boolean,
  messageOrOptions?: string | UnsavedChangesOptions,
): { dialog: ReactNode; bypass: (go: () => void | Promise<void>) => void | Promise<void> } {
  const { t } = useTranslation();
  const options: UnsavedChangesOptions =
    typeof messageOrOptions === "string" ? { message: messageOrOptions } : (messageOrOptions ?? {});
  const { ignore, message } = options;
  const skip = useRef(false);
  const location = useLocation();

  const blocker = useBlocker(
    useCallback<BlockerFunction>(
      ({ currentLocation, nextLocation }) => {
        if (!dirty || skip.current) return false;
        const pathChanged = currentLocation.pathname !== nextLocation.pathname;
        const searchChanged = currentLocation.search !== nextLocation.search;
        if (!pathChanged && !searchChanged) return false;
        if (typeof ignore === "function") return !ignore(currentLocation, nextLocation);
        if (ignore === true) return pathChanged;
        return true;
      },
      [dirty, ignore],
    ),
  );

  useEffect(() => {
    mounted++;
    if (import.meta.env.DEV && mounted > 1)
      console.warn("useUnsavedChangesGuard: more than one guard is mounted; only the last one blocks.");
    return () => {
      mounted--;
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  // A bypass lasts until the next location change…
  useEffect(() => {
    skip.current = false;
  }, [location.key]);
  // …or until there are new changes to protect.
  const wasDirty = useRef(dirty);
  useEffect(() => {
    if (dirty && !wasDirty.current) skip.current = false;
    wasDirty.current = dirty;
  }, [dirty]);

  // Nothing left to protect (saved meanwhile): let a held navigation go.
  useEffect(() => {
    if (blocker.state === "blocked" && !dirty) blocker.proceed();
  }, [blocker, dirty]);

  const bypass = useCallback((go: () => void | Promise<void>) => {
    skip.current = true;
    return go();
  }, []);

  const dialog =
    blocker.state === "blocked" ? (
      <ConfirmDialog
        variant="destructive"
        title={t("dialog.unsaved.title")}
        message={message ?? t("dialog.unsaved.message")}
        confirmLabel={t("dialog.unsaved.discard")}
        cancelLabel={t("dialog.unsaved.keep")}
        onConfirm={() => blocker.proceed()}
        onCancel={() => blocker.reset()}
      />
    ) : null;

  return { dialog, bypass };
}
