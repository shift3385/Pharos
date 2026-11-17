import { afterEach, describe, expect, it, vi } from "vitest";
import { browserShortcut, installDesktopKeyGuard } from "./desktopKeyGuard";

type Init = KeyboardEventInit & { key: string; code?: string };

function letter(l: string, mods: Partial<KeyboardEventInit> = {}): Init {
  return { key: l.toLowerCase(), code: `Key${l}`, ctrlKey: true, ...mods };
}

const verdict = (init: Init) =>
  browserShortcut(new KeyboardEvent("keydown", init));

describe("browserShortcut (NC-058 key list)", () => {
  it.each([
    ["Ctrl+P print", letter("P")],
    ["Ctrl+Shift+P print preview", letter("P", { shiftKey: true })],
    ["Ctrl+F find", letter("F")],
    ["Ctrl+G find next", letter("G")],
    ["Ctrl+Shift+G find previous", letter("G", { shiftKey: true })],
    ["Ctrl+R reload", letter("R")],
    ["Ctrl+Shift+R hard reload", letter("R", { shiftKey: true })],
    ["Ctrl+S save page", letter("S")],
    ["Ctrl+U view source", letter("U")],
    ["Ctrl+J downloads", letter("J")],
    ["Ctrl+H history", letter("H")],
    ["Ctrl+D bookmark", letter("D")],
    ["Ctrl+O open file", letter("O")],
    ["Ctrl+N new window", letter("N")],
    ["⌘P on macOS", letter("P", { ctrlKey: false, metaKey: true })],
    ["F3", { key: "F3", code: "F3" }],
    ["Shift+F3", { key: "F3", code: "F3", shiftKey: true }],
    ["F5", { key: "F5", code: "F5" }],
    ["Ctrl+F5", { key: "F5", code: "F5", ctrlKey: true }],
    ["F7 caret browsing", { key: "F7", code: "F7" }],
    ["Ctrl+plus", { key: "+", code: "BracketRight", ctrlKey: true }],
    ["Ctrl+=", { key: "=", code: "Equal", ctrlKey: true }],
    ["Ctrl+minus", { key: "-", code: "Slash", ctrlKey: true }],
    ["Ctrl+0", { key: "0", code: "Digit0", ctrlKey: true }],
    ["Ctrl+numpad plus", { key: "+", code: "NumpadAdd", ctrlKey: true }],
    // A layout where the P key types another letter: the code decides.
    ["Ctrl+P by code", { key: "π", code: "KeyP", ctrlKey: true }],
  ])("blocks %s", (_, init) => {
    expect(verdict(init)).toBe("block");
  });

  it("takes Alt+Left / Alt+Right as history navigation", () => {
    expect(verdict({ key: "ArrowLeft", altKey: true })).toBe("back");
    expect(verdict({ key: "ArrowRight", altKey: true })).toBe("forward");
  });

  it.each([
    ["Ctrl+K search", letter("K")],
    ["Ctrl+C copy", letter("C")],
    ["Ctrl+V paste", letter("V")],
    ["Ctrl+X cut", letter("X")],
    ["Ctrl+Z undo", letter("Z")],
    ["Ctrl+A select all", letter("A")],
    ["Ctrl+Shift+J DevTools console", letter("J", { shiftKey: true })],
    ["Ctrl+Shift+I DevTools", letter("I", { shiftKey: true })],
    ["Ctrl+Shift+S", letter("S", { shiftKey: true })],
    ["Ctrl+Alt+P", letter("P", { altKey: true })],
    ["F12", { key: "F12", code: "F12" }],
    ["plain p", { key: "p", code: "KeyP" }],
    ["Tab", { key: "Tab", code: "Tab" }],
    ["Ctrl+ArrowLeft word jump", { key: "ArrowLeft", ctrlKey: true }],
    ["Alt+ArrowDown (Select, DatePicker)", { key: "ArrowDown", altKey: true }],
    ["Shift+Alt+Left", { key: "ArrowLeft", altKey: true, shiftKey: true }],
    ["autofill keydown without key", { key: undefined as unknown as string }],
  ])("leaves %s alone", (_, init) => {
    expect(verdict(init)).toBeNull();
  });
});

describe("installDesktopKeyGuard", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
    vi.restoreAllMocks();
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
    expect(press(letter("P")).defaultPrevented).toBe(false);
  });

  it("cancels a browser shortcut nobody in Pharos handled", () => {
    cleanups.push(installDesktopKeyGuard(window, true));
    expect(press(letter("P")).defaultPrevented).toBe(true);
    expect(press({ key: "F5", code: "F5" }).defaultPrevented).toBe(true);
    expect(press(letter("C")).defaultPrevented).toBe(false);
  });

  it("lets a Pharos handler registered later own the key (editor Ctrl+P)", () => {
    cleanups.push(installDesktopKeyGuard(window, true));
    // Like the editor and Ctrl+K: skip a key that is already cancelled.
    let took = false;
    on(window, (e) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      took = true;
    });
    expect(press(letter("P")).defaultPrevented).toBe(true);
    expect(took).toBe(true);
  });

  it("runs after document and element handlers too", () => {
    cleanups.push(installDesktopKeyGuard(window, true));
    const seen: boolean[] = [];
    on(document.body, (e) => seen.push(e.defaultPrevented));
    on(document, (e) => seen.push(e.defaultPrevented));
    const e = press(letter("F"));
    expect(seen).toEqual([false, false]);
    expect(e.defaultPrevented).toBe(true);
  });

  it("turns Alt+Left / Alt+Right into history navigation, once", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const forward = vi
      .spyOn(window.history, "forward")
      .mockImplementation(() => {});
    cleanups.push(installDesktopKeyGuard(window, true));
    expect(press({ key: "ArrowLeft", altKey: true }).defaultPrevented).toBe(
      true,
    );
    press({ key: "ArrowRight", altKey: true });
    expect(back).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledTimes(1);
  });

  it("leaves Alt+Left to a Pharos handler that takes it", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    cleanups.push(installDesktopKeyGuard(window, true));
    on(document.body, (e) => e.preventDefault());
    press({ key: "ArrowLeft", altKey: true });
    expect(back).not.toHaveBeenCalled();
  });

  it("stops after uninstall", () => {
    installDesktopKeyGuard(window, true)();
    expect(press(letter("P")).defaultPrevented).toBe(false);
  });
});
