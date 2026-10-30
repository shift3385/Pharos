import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useBlocker, type BlockerFunction } from "react-router";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Asks before unsaved changes are lost (RED-V3k, ADR-0028 §9). While `dirty`:
 * - any navigation that changes the address (links, the sidebar, section
 *   pills, `navigate`, `setSearchParams`, and the system/Android «Atrás») is
 *   held by the router (`useBlocker`, which needs the data router of
 *   `main.tsx`) until the user picks «Descartar cambios» or «Seguir editando»;
 * - reloading or closing the window asks the browser to confirm
 *   (`beforeunload`).
 *
 * Render the returned `dialog`. A navigation the screen starts on purpose
 * right after saving (e.g. opening a new case by its id) goes through
 * `bypass(() => navigate(…))`, because `dirty` only turns false on the next
 * render.
 */
export function useUnsavedChangesGuard(
  dirty: boolean,
  message?: string,
): { dialog: ReactNode; bypass: (go: () => void) => void } {
  const { t } = useTranslation();
  const skip = useRef(false);
  const blocker = useBlocker(
    useCallback<BlockerFunction>(
      ({ currentLocation, nextLocation }) =>
        dirty &&
        !skip.current &&
        (currentLocation.pathname !== nextLocation.pathname ||
          currentLocation.search !== nextLocation.search),
      [dirty],
    ),
  );

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  // Nothing left to protect (saved meanwhile): let a held navigation go.
  useEffect(() => {
    if (blocker.state === "blocked" && !dirty) blocker.proceed();
  }, [blocker, dirty]);

  const bypass = useCallback((go: () => void) => {
    skip.current = true;
    try {
      go();
    } finally {
      skip.current = false;
    }
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
