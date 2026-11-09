import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

/** The usual «¿Descartar los cambios?» question of a form with unsaved changes. */
export const discardOptions = (t: (key: string) => string): ConfirmOptions => ({
  title: t("dialog.unsaved.title"),
  message: t("dialog.unsaved.message"),
  confirmLabel: t("dialog.unsaved.discard"),
  cancelLabel: t("dialog.unsaved.keep"),
  danger: true,
});

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Error-coloured confirm button (the confirm loses something). */
  danger?: boolean;
  /** Critical (NC-014/NC-017): only the buttons answer it; see ConfirmDialog. */
  variant?: "default" | "destructive";
}

/**
 * A Pharos confirmation instead of the browser's `window.confirm` (NC-017,
 * MAN-03): `await confirm({...})` resolves to true on the confirm button and
 * false on «Cancelar» (or Escape / a click outside, for a normal one). Render
 * the returned `dialog` in the component.
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ title, message, confirmLabel }))) return;
 */
export function useConfirm(): { confirm: (options: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [open, setOpen] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((answer: boolean) => void) | null>(null);
  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // A second request answers the first one «no»: never two at once.
        resolver.current?.(false);
        resolver.current = resolve;
        setOpen(options);
      }),
    [],
  );
  const answer = (value: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setOpen(null);
    resolve?.(value);
  };
  const dialog = open ? (
    <ConfirmDialog
      title={open.title}
      message={open.message}
      confirmLabel={open.confirmLabel}
      cancelLabel={open.cancelLabel}
      danger={open.danger}
      variant={open.variant}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  ) : null;
  return { confirm, dialog };
}
