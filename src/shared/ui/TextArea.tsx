import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";
import {
  TEXTAREA_MIN_LINES,
  fitToContent,
  supportsFieldSizing,
  type TextAreaSize,
} from "./textAreaSize";
import "./textArea.css";

export type { TextAreaSize };

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  size: TextAreaSize;
};

/** Every multi-line field in Pharos (UX-33): starts at its size's lines, grows
 *  with the text so the page scrolls instead of the field, has no resize grip
 *  and never splits words with a hyphen. */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea({ size, className, rows, ...rest }, forwarded) {
    const inner = useRef<HTMLTextAreaElement | null>(null);
    const setRef = useCallback(
      (el: HTMLTextAreaElement | null) => {
        inner.current = el;
        if (typeof forwarded === "function") forwarded(el);
        else if (forwarded) forwarded.current = el;
      },
      [forwarded],
    );

    useLayoutEffect(() => {
      if (inner.current && !supportsFieldSizing()) fitToContent(inner.current);
    }, [rest.value]);

    useEffect(() => {
      if (supportsFieldSizing()) return;
      const refit = () => inner.current && fitToContent(inner.current);
      window.addEventListener("resize", refit);
      return () => window.removeEventListener("resize", refit);
    }, []);

    return (
      <textarea
        ref={setRef}
        rows={rows ?? TEXTAREA_MIN_LINES[size]}
        data-size={size}
        className={`ui-textarea ui-textarea--${size}${className ? ` ${className}` : ""}`}
        {...rest}
      />
    );
  },
);
