import { useCallback, useId, useRef, useState } from "react";

/** State and trigger props for a popover: `ref`, `aria-expanded`,
 *  `aria-controls`, `aria-haspopup`, `data-pop` and the toggle on click. */
export function usePopover(kind: "menu" | "dialog" = "menu") {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  return {
    open,
    setOpen,
    close,
    anchorRef,
    id,
    triggerProps: {
      ref: anchorRef,
      "aria-haspopup": kind,
      "aria-expanded": open,
      "aria-controls": open ? id : undefined,
      "data-pop": "",
      onClick: () => setOpen((o) => !o),
    } as const,
  };
}
