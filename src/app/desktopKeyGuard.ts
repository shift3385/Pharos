// Browser shortcuts in the desktop window (NC-058, FIX-31). The desktop app is
// a WebView2 window, and some of its browser shortcuts act outside Pharos or
// expose it: print, open a local file into the window, save the page, view
// its source, a new window, downloads, history, bookmarks, caret browsing and,
// outside development, DevTools. This guard cancels exactly those. Harmless
// browser keys stay: reload (F5, Ctrl+R), zoom, find in page (Ctrl+F, F3) and
// Alt+Left/Right, which go through history and so through the unsaved-changes
// prompt (RED-V3k). The web build is untouched: a browser's own shortcuts
// belong to its user.
//
// A Pharos handler always wins: the guard decides after every other keydown
// listener ran (React, document, window), and only cancels a key that nobody
// handled (`defaultPrevented` still false). Ctrl+P in the case editor keeps
// opening «Ir a un caso…».

import { isTauri } from "@shared/platform";

type Key = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
>;

/** Ctrl + letter: print, open file, save page, view source, new window,
 *  downloads, history, bookmark. */
const CTRL = new Set(["P", "O", "S", "U", "N", "J", "H", "D"]);
/** Ctrl + Shift + letter: print preview, new private window. */
const CTRL_SHIFT = new Set(["P", "N"]);
/** Ctrl + Shift + letter that open DevTools (inspector, console, picker).
 *  WebView2 handles Ctrl+Shift+I before the page, so cancelling it does not
 *  stop it in a debug build; a release build has no DevTools at all. */
const DEVTOOLS_CTRL_SHIFT = new Set(["I", "J", "C"]);

function letterOf(e: Key): string | null {
  if (e.code?.startsWith("Key")) return e.code.slice(3);
  return e.key?.length === 1 ? e.key.toUpperCase() : null;
}

/** True for a browser shortcut the desktop app cancels. `devtools`: whether
 *  the DevTools keys stay available (development only). Pure, so the key
 *  list is tested on its own. */
export function isBlockedShortcut(e: Key, devtools = false): boolean {
  if (e.altKey) return false;
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === "F7" && !ctrl && !e.shiftKey) return true;
  if (e.key === "F12") return !devtools;
  if (!ctrl) return false;
  const letter = letterOf(e);
  if (!letter) return false;
  if (!e.shiftKey) return CTRL.has(letter);
  if (CTRL_SHIFT.has(letter)) return true;
  return !devtools && DEVTOOLS_CTRL_SHIFT.has(letter);
}

/** Installs the guard on `target` (the window). Returns the uninstaller.
 *  `desktop` defaults to `isTauri()`: on the web it installs nothing.
 *  `devtools` defaults to the Vite dev server (`tauri dev`). */
export function installDesktopKeyGuard(
  target: Window = window,
  desktop: boolean = isTauri(),
  devtools: boolean = import.meta.env.DEV,
): () => void {
  if (!desktop) return () => {};

  const onCapture = (e: KeyboardEvent) => {
    if (!isBlockedShortcut(e, devtools)) return;
    // A listener added to the window while the event is in its capture phase
    // runs in the window's bubble phase, after every listener already there:
    // the last word, once the page's own handlers had theirs.
    target.addEventListener(
      "keydown",
      (late: Event) => {
        if (late === e && !e.defaultPrevented) e.preventDefault();
      },
      { once: true },
    );
  };

  target.addEventListener("keydown", onCapture, { capture: true });
  return () =>
    target.removeEventListener("keydown", onCapture, { capture: true });
}
