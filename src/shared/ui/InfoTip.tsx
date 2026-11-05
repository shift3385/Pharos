import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CircleHelp } from "lucide-react";
import { computePosition } from "./popoverPosition";
import "./infoTip.css";

const OPEN_DELAY = 100;
const CLOSE_DELAY = 150;

/**
 * Contextual help behind a [?] button (UX-10, SPEC §4 «Ayuda contextual»), for
 * help that is long and secondary. Short, essential hints stay inline.
 *
 * - The text always exists in the DOM under `id`, so the field's control can
 *   point at it with `aria-describedby` (FormField's `info` prop does): a screen
 *   reader hears it on the control without opening anything.
 * - It opens on hover, on keyboard focus and on click/tap (touch has no hover),
 *   and the bubble stays while the pointer is over it. Esc, a tap outside or
 *   leaving close it (WCAG 1.4.13: dismissible, hoverable, persistent).
 * - The bubble is portalled to <body> with `position: fixed`, so a dialog's
 *   scroll or transform does not clip it; it flips up when it does not fit.
 */
export function InfoTip({
  id,
  label,
  children,
}: {
  /** Id of the help text; give it to the control's `aria-describedby`. */
  id: string;
  /** What the help is about (the field's label), for the button's name. */
  label: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const btn = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const timer = useRef<number>();

  const later = (fn: () => void, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };
  const close = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
    setPinned(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (!open || !btn.current || !bubble.current) return;
    const r = bubble.current.getBoundingClientRect();
    const pos = computePosition(
      btn.current.getBoundingClientRect(),
      { width: r.width, height: r.height },
      "bottom-start",
      { width: window.innerWidth, height: window.innerHeight },
    );
    setStyle({ ...pos.style, maxHeight: undefined });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Capture phase: Esc closes the tip, not the dialog around it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (btn.current?.contains(target) || bubble.current?.contains(target)) return;
      close();
    };
    const onScroll = (e: Event) => {
      if (!bubble.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const hoverIn = (e: ReactPointerEvent) => {
    if (e.pointerType === "touch") return;
    later(() => setOpen(true), OPEN_DELAY);
  };
  const hoverOut = (e: ReactPointerEvent) => {
    if (e.pointerType === "touch" || pinned) return;
    if (btn.current && btn.current === document.activeElement) return;
    later(() => setOpen(false), CLOSE_DELAY);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="infotip"
        aria-label={label ? t("common.moreInfo", { label }) : t("common.moreInfoPlain")}
        aria-describedby={id}
        aria-expanded={open}
        data-open={open || undefined}
        onPointerEnter={hoverIn}
        onPointerLeave={hoverOut}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (bubble.current?.contains(e.relatedTarget as Node)) return;
          close();
        }}
        onClick={() => {
          if (pinned) close();
          else {
            window.clearTimeout(timer.current);
            setOpen(true);
            setPinned(true);
          }
        }}
      >
        <CircleHelp size={16} aria-hidden="true" />
      </button>
      {createPortal(
        <span
          ref={bubble}
          id={id}
          role="tooltip"
          className="infotip__bubble"
          hidden={!open}
          style={open ? style : undefined}
          onPointerEnter={() => window.clearTimeout(timer.current)}
          onPointerLeave={hoverOut}
        >
          {children}
        </span>,
        document.body,
      )}
    </>
  );
}
