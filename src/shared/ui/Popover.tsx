import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { computePosition, type PopoverPlacement, type Position } from "./popoverPosition";
import "./popover.css";

/** Only one menu or popover is open at a time (SPEC §6): opening one closes
 *  the previous one. */
let closeCurrent: (() => void) | null = null;

export type { PopoverPlacement } from "./popoverPosition";

/**
 * Floating panel anchored to a trigger (SPEC §6), the base of `Menu`, the
 * search and notifications placeholders, and any dropdown in V1–V4.
 * - Rendered in a portal with `position: fixed`, so no `overflow` clips it.
 * - Closes on a click outside, a scroll outside it, Escape (the focus goes back
 *   to the trigger) and when another popover opens. The trigger and the panel
 *   carry `data-pop` so a click on them is not "outside".
 * - Re-measures on open and on resize.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  placement = "bottom-start",
  id,
  role,
  label,
  className = "",
  onKeyDown,
  panelRef: externalRef,
  initialFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  placement?: PopoverPlacement;
  id?: string;
  role?: "menu" | "dialog";
  label?: string;
  className?: string;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  panelRef?: RefObject<HTMLDivElement>;
  /** Element to focus once the panel is placed. By default a `dialog`
   *  popover focuses itself, so its content is next in the reading order. */
  initialFocus?: () => HTMLElement | null | undefined;
  children: ReactNode;
}) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = externalRef ?? ownRef;
  const [position, setPosition] = useState<Position | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = ref.current;
    if (!anchor || !panel) return;
    const next = computePosition(
      anchor.getBoundingClientRect(),
      { width: panel.offsetWidth, height: panel.scrollHeight },
      placement,
      { width: window.innerWidth, height: window.innerHeight },
    );
    // Same place → same object, so re-measuring never loops.
    setPosition((prev) =>
      prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
  }, [anchorRef, ref, placement]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    place();
  }, [open, place]);

  // The focus moves in once the panel is placed and shown (a layout effect of
  // that commit: an element still being measured could refuse it).
  const placed = open && position !== null;
  const focusRef = useRef(initialFocus);
  focusRef.current = initialFocus;
  useLayoutEffect(() => {
    if (!placed) return;
    const target = focusRef.current ? focusRef.current() : role === "dialog" ? ref.current : null;
    target?.focus();
  }, [placed, role, ref]);

  // When it closes (a choice, Tab, Escape) with the focus inside, the focus
  // goes back to the trigger instead of being lost with the panel. Tracked
  // with focus events: by the time the cleanup runs the panel is gone.
  const focusInside = useRef(false);
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    return () => {
      if (focusInside.current) anchor?.focus();
      focusInside.current = false;
    };
  }, [open, anchorRef]);

  // Re-measured when its content changes size (e.g. a filtered list).
  useEffect(() => {
    const panel = ref.current;
    if (!open || !panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => place());
    observer.observe(panel);
    return () => observer.disconnect();
  }, [open, ref, place]);

  useEffect(() => {
    if (!open) return;
    const close = () => closeRef.current();
    if (closeCurrent && closeCurrent !== close) closeCurrent();
    closeCurrent = close;

    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (ref.current?.contains(target) || anchorRef.current?.contains(target));
    const onDown = (e: PointerEvent | MouseEvent) => {
      if (!inside(e.target)) close();
    };
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target))) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Captured first, so a dialog that holds this popover stays open.
      e.stopPropagation();
      close();
      anchorRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      if (closeCurrent === close) closeCurrent = null;
    };
  }, [open, anchorRef, ref, place]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      id={id}
      role={role}
      aria-label={label}
      data-pop=""
      data-placement={position?.direction ?? "down"}
      className={`popover ${className}`.trim()}
      tabIndex={role === "dialog" ? -1 : undefined}
      // Transparent for the first measurement so it never flashes in the wrong
      // place (not `visibility: hidden`, which would refuse the focus).
      style={
        position ? position.style : { opacity: 0, pointerEvents: "none", top: 0, left: 0 }
      }
      onKeyDown={onKeyDown}
      onFocus={() => (focusInside.current = true)}
      onBlur={(e) => {
        if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)))
          focusInside.current = false;
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
