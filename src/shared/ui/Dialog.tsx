import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import "./ConfirmDialog.css";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Open dialogs in opening order. The top one, which handles Tab and Escape,
 *  is the latest that has no open dialog nested inside it (a child's effect
 *  runs before its parent's, so nesting cannot rely on order alone). */
const stack: HTMLElement[] = [];

function isTop(el: HTMLElement): boolean {
  const open = stack.filter((d) => !d.querySelector("[aria-modal='true']"));
  return open[open.length - 1] === el;
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * Accessible modal dialog (WCAG 2.1 AA, UX-05) that every Pharos modal uses.
 * - Focus moves into the dialog on open (`initialFocus`, an `autoFocus`
 *   child, the first control, or the dialog itself) and returns to the
 *   element that opened it on close.
 * - Tab and Shift+Tab stay inside the dialog.
 * - Escape and a click on the backdrop call `onClose`, unless the dialog is
 *   not `dismissable` (e.g. while it saves) or has no `onClose`.
 * - It is named by its title (`labelledBy`) or by `label`.
 */
export function Dialog({
  labelledBy,
  label,
  describedBy,
  onClose,
  dismissable = true,
  initialFocus,
  role = "dialog",
  className = "cd",
  overlayClassName = "cd-overlay",
  children,
}: {
  labelledBy?: string;
  label?: string;
  describedBy?: string;
  onClose?: () => void;
  dismissable?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  role?: "dialog" | "alertdialog";
  className?: string;
  overlayClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<(() => void) | undefined>(undefined);
  closeRef.current = dismissable ? onClose : undefined;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    stack.push(root);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!root.contains(document.activeElement)) {
      const target = initialFocus?.current ?? focusables(root)[0] ?? root;
      target.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (!isTop(root)) return;
      if (e.key === "Escape") {
        if (!closeRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(root), 1);
      if (opener?.isConnected) opener.focus();
    };
    // Focus is managed once per open; later prop changes must not steal it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={overlayClassName}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current?.();
      }}
    >
      <div
        ref={ref}
        className={className}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
