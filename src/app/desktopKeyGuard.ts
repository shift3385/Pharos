// Browser shortcuts in the desktop window (NC-058, FIX-31). The desktop app is
// a WebView2 window, and its browser accelerators (print, find, reload, view
// source, downloads, zoom…) have no place in Pharos. Release builds turn them
// off in WebView2 itself (`lib.rs`, AreBrowserAcceleratorKeysEnabled); this
// guard covers debug builds (DevTools stays on there) and anything the native
// setting lets through. Ctrl + wheel needs nothing here: Tauri leaves
// `zoomHotkeysEnabled` off, so WebView2 has no zoom control in any build
// (IsZoomControlEnabled = false). The web build is untouched: a browser's own shortcuts
// belong to its user.
//
// A Pharos handler always wins: the guard decides after every other keydown
// listener ran (React, document, window), and only cancels a key that nobody
// handled (`defaultPrevented` still false). Ctrl+P in the case editor and
// Ctrl+K keep working.

import { isTauri } from "@shared/platform";

type Key = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
>;

/** What the guard does with a key: cancel it, take it as history navigation
 *  (Alt+Left/Right), or leave it alone. */
export type KeyVerdict = "block" | "back" | "forward" | null;

/** Ctrl + letter shortcuts of the browser, by layout-independent code:
 *  print, find, find next, reload, save page, view source, downloads,
 *  history, bookmark, open file, new window. Ctrl+Shift+J (DevTools console)
 *  is left to the webview, which only enables it in debug builds. */
const CTRL_LETTERS = new Set([
  "P",
  "F",
  "G",
  "R",
  "S",
  "U",
  "J",
  "H",
  "D",
  "O",
  "N",
]);
const SHIFT_ALLOWED = new Set(["P", "G", "R"]);
const ZOOM_CODES = new Set([
  "Equal",
  "Minus",
  "Digit0",
  "NumpadAdd",
  "NumpadSubtract",
  "Numpad0",
]);
const ZOOM_KEYS = new Set(["+", "=", "-", "_", "0"]);

function letterOf(e: Key): string | null {
  if (e.code?.startsWith("Key")) return e.code.slice(3);
  return e.key?.length === 1 ? e.key.toUpperCase() : null;
}

/** Classifies a keydown. Pure, so the key list is tested on its own. */
export function browserShortcut(e: Key): KeyVerdict {
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.altKey && !ctrl && !e.shiftKey) {
    if (e.key === "ArrowLeft") return "back";
    if (e.key === "ArrowRight") return "forward";
    return null;
  }
  if (e.altKey) return null;
  // F3 / Shift+F3 find, F5 / Ctrl+F5 / Shift+F5 reload, F7 caret browsing.
  if (e.key === "F3" || e.key === "F5" || e.key === "F7") return "block";
  if (!ctrl) return null;
  if (ZOOM_CODES.has(e.code) || ZOOM_KEYS.has(e.key)) return "block";
  const letter = letterOf(e);
  if (!letter || !CTRL_LETTERS.has(letter)) return null;
  if (e.shiftKey && !SHIFT_ALLOWED.has(letter)) return null;
  return "block";
}

/** Installs the guard on `target` (the window). Returns the uninstaller.
 *  `desktop` defaults to `isTauri()`: on the web it installs nothing. */
export function installDesktopKeyGuard(
  target: Window = window,
  desktop: boolean = isTauri(),
): () => void {
  if (!desktop) return () => {};

  const onCapture = (e: KeyboardEvent) => {
    const verdict = browserShortcut(e);
    if (!verdict) return;
    // A listener added to the window while the event is in its capture phase
    // runs in the window's bubble phase, after every listener already there:
    // the last word, once the page's own handlers had theirs.
    target.addEventListener(
      "keydown",
      (late: Event) => {
        if (late !== e || e.defaultPrevented) return;
        e.preventDefault();
        if (verdict === "back") target.history.back();
        else if (verdict === "forward") target.history.forward();
      },
      { once: true },
    );
  };

  target.addEventListener("keydown", onCapture, { capture: true });
  return () =>
    target.removeEventListener("keydown", onCapture, { capture: true });
}
