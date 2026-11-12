/** How much text a field holds (UX-33). Each size sets the lines the field
 *  starts with and how far it grows before it scrolls inside (textArea.css):
 *  - `document`: 8 lines, up to half the window (plan steps, status report);
 *  - `description`: 5 lines, up to 15 (requirement, case, defect, card, template);
 *  - `short`: 3 lines, up to 10 (expected/actual, run notes, cycle, custom values);
 *  - `step`: 2 lines, up to 6 (a flow's steps and results);
 *  - `paste`: 2 lines, up to 4 (a pasted key, context or option list);
 *  - `cell`: 1 line, up to 12 (a cell of a two-column list, e.g. role / duty). */
export type TextAreaSize =
  "document" | "description" | "short" | "step" | "paste" | "cell";

export const TEXTAREA_MIN_LINES: Record<TextAreaSize, number> = {
  document: 8,
  description: 5,
  short: 3,
  step: 2,
  paste: 2,
  cell: 1,
};

/** True when the browser sizes a textarea to its text by itself (WebView2 and
 *  Chromium 123+). Elsewhere the field measures its text in JS. */
export function supportsFieldSizing(): boolean {
  return (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("field-sizing", "content")
  );
}

/** JS fallback: height follows the text, within the CSS min and max. Past the
 *  max the field stops and scrolls inside. */
export function fitToContent(el: HTMLTextAreaElement) {
  const style = getComputedStyle(el);
  const border =
    (parseFloat(style.borderTopWidth) || 0) +
    (parseFloat(style.borderBottomWidth) || 0);
  el.style.height = "auto";
  const wanted = el.scrollHeight + border;
  const max = parseFloat(style.maxHeight);
  const capped = Number.isFinite(max) && wanted > max;
  el.style.height = `${capped ? max : wanted}px`;
  el.style.overflowY = capped ? "auto" : "hidden";
}
