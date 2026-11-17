import { afterEach, describe, expect, it } from "vitest";
import { installDesktopKeyGuard, isBlockedShortcut } from "./desktopKeyGuard";

type Init = KeyboardEventInit & { key: string; code?: string };

function ctrl(l: string, mods: Partial<KeyboardEventInit> = {}): Init {
  return { key: l.toLowerCase(), code: `Key${l}`, ctrlKey: true, ...mods };
}
const shift = { shiftKey: true };

const blocked = (init: Init, devtools = false) =>
  isBlockedShortcut(new KeyboardEvent("keydown", init), devtools);

describe("isBlockedShortcut (NC-058 key list)", () => {
  it.each([
    ["Ctrl+P print", ctrl("P")],
    ["Ctrl+Shift+P print preview", ctrl("P", shift)],
    ["Ctrl+O open a local file", ctrl("O")],
    ["Ctrl+S save page", ctrl("S")],
    ["Ctrl+U view source", ctrl("U")],
    ["Ctrl+N new window", ctrl("N")],
    ["Ctrl+Shift+N new private window", ctrl("N", shift)],
    ["Ctrl+J downloads", ctrl("J")],
    ["Ctrl+H history", ctrl("H")],
    ["Ctrl+D bookmark", ctrl("D")],
    ["F7 caret browsing", { key: "F7", code: "F7" }],
    ["⌘P on macOS", ctrl("P", { ctrlKey: false, metaKey: true })],
    // A layout where the P key types another letter: the code decides.
    ["Ctrl+P by code", { key: "π", code: "KeyP", ctrlKey: true }],
    ["Ctrl+P without code", { key: "p", ctrlKey: true }],
    ["F12 DevTools", { key: "F12", code: "F12" }],
    ["Ctrl+Shift+I DevTools", ctrl("I", shift)],
    ["Ctrl+Shift+J console", ctrl("J", shift)],
    ["Ctrl+Shift+C element picker", ctrl("C", shift)],
  ])("blocks %s", (_, init) => {
    expect(blocked(init)).toBe(true);
  });

  it.each([
    ["F12", { key: "F12", code: "F12" }],
    ["Ctrl+Shift+I", ctrl("I", shift)],
    ["Ctrl+Shift+J", ctrl("J", shift)],
    ["Ctrl+Shift+C", ctrl("C", shift)],
  ])("keeps DevTools key %s while developing", (_, init) => {
    expect(blocked(init, true)).toBe(false);
  });

  it("still blocks print and the rest while developing", () => {
    expect(blocked(ctrl("P"), true)).toBe(true);
    expect(blocked(ctrl("U"), true)).toBe(true);
  });

  it.each([
    ["Ctrl+R reload", ctrl("R")],
    ["Ctrl+Shift+R hard reload", ctrl("R", shift)],
    ["F5 reload", { key: "F5", code: "F5" }],
    ["Ctrl+F5 reload", { key: "F5", code: "F5", ctrlKey: true }],
    ["Ctrl+F find", ctrl("F")],
    ["F3 find next", { key: "F3", code: "F3" }],
    ["Ctrl+G find next", ctrl("G")],
    ["Ctrl+plus zoom", { key: "+", code: "BracketRight", ctrlKey: true }],
    ["Ctrl+minus zoom", { key: "-", code: "Slash", ctrlKey: true }],
    ["Ctrl+0 zoom", { key: "0", code: "Digit0", ctrlKey: true }],
    ["Alt+Left back", { key: "ArrowLeft", code: "ArrowLeft", altKey: true }],
    [
      "Alt+Right forward",
      { key: "ArrowRight", code: "ArrowRight", altKey: true },
    ],
    ["Ctrl+K search", ctrl("K")],
    ["Ctrl+C copy", ctrl("C")],
    ["Ctrl+V paste", ctrl("V")],
    ["Ctrl+X cut", ctrl("X")],
    ["Ctrl+Z undo", ctrl("Z")],
    ["Ctrl+A select all", ctrl("A")],
    ["Ctrl+Shift+S", ctrl("S", shift)],
    ["Ctrl+Alt+P", ctrl("P", { altKey: true })],
    ["plain p", { key: "p", code: "KeyP" }],
    ["Tab", { key: "Tab", code: "Tab" }],
    ["Alt+ArrowDown (Select, DatePicker)", { key: "ArrowDown", altKey: true }],
    ["autofill keydown without key", { key: undefined as unknown as string }],
  ])("leaves %s alone", (_, init) => {
    expect(blocked(init)).toBe(false);
  });
});

describe("installDesktopKeyGuard", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  function press(init: Init, target: EventTarget = document.body) {
    const e = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(e);
    return e;
  }

  function on(target: EventTarget, fn: (e: KeyboardEvent) => void) {
    const listener = fn as EventListener;
    target.addEventListener("keydown", listener);
    cleanups.push(() => target.removeEventListener("keydown", listener));
  }

  it("does nothing outside the desktop app", () => {
    cleanups.push(installDesktopKeyGuard(window, false));
    expect(press(ctrl("P")).defaultPrevented).toBe(false);
  });

  it("cancels a listed shortcut nobody in Pharos handled", () => {
    cleanups.push(installDesktopKeyGuard(window, true, false));
    expect(press(ctrl("P")).defaultPrevented).toBe(true);
    expect(press(ctrl("O")).defaultPrevented).toBe(true);
    expect(press({ key: "F12", code: "F12" }).defaultPrevented).toBe(true);
  });

  it("leaves reload, find, zoom and Alt+Left to the webview", () => {
    cleanups.push(installDesktopKeyGuard(window, true, false));
    expect(press({ key: "F5", code: "F5" }).defaultPrevented).toBe(false);
    expect(press(ctrl("F")).defaultPrevented).toBe(false);
    expect(
      press({ key: "0", code: "Digit0", ctrlKey: true }).defaultPrevented,
    ).toBe(false);
    expect(press({ key: "ArrowLeft", altKey: true }).defaultPrevented).toBe(
      false,
    );
  });

  it("keeps DevTools keys while developing", () => {
    cleanups.push(installDesktopKeyGuard(window, true, true));
    expect(press({ key: "F12", code: "F12" }).defaultPrevented).toBe(false);
    expect(press(ctrl("P")).defaultPrevented).toBe(true);
  });

  it("lets a Pharos handler registered later own the key (editor Ctrl+P)", () => {
    cleanups.push(installDesktopKeyGuard(window, true, false));
    // Like the editor and Ctrl+K: skip a key that is already cancelled.
    let took = false;
    on(window, (e) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      took = true;
    });
    expect(press(ctrl("P")).defaultPrevented).toBe(true);
    expect(took).toBe(true);
  });

  it("runs after document and element handlers too", () => {
    cleanups.push(installDesktopKeyGuard(window, true, false));
    const seen: boolean[] = [];
    on(document.body, (e) => seen.push(e.defaultPrevented));
    on(document, (e) => seen.push(e.defaultPrevented));
    const e = press(ctrl("S"));
    expect(seen).toEqual([false, false]);
    expect(e.defaultPrevented).toBe(true);
  });

  it("stops after uninstall", () => {
    installDesktopKeyGuard(window, true, false)();
    expect(press(ctrl("P")).defaultPrevented).toBe(false);
  });
});
