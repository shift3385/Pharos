import { act } from "@testing-library/react";
import { vi } from "vitest";

type Callback = (entries: { contentRect: { width: number } }[]) => void;

const observers = new Set<MockResizeObserver>();

/** jsdom has no layout: this observer reports the width set by the test. */
class MockResizeObserver {
  constructor(private readonly callback: Callback) {}
  observe() {
    observers.add(this);
  }
  unobserve() {}
  disconnect() {
    observers.delete(this);
  }
  fire(width: number) {
    this.callback([{ contentRect: { width } }]);
  }
}

/** Sets the app container's width before rendering: `ViewportProvider` reads
 *  it as its first measurement (jsdom gives the element no width, so it falls
 *  back to `window.innerWidth`) and through the mocked `ResizeObserver`.
 *  `vi.unstubAllGlobals()` (setupTests) restores both. */
export function setViewportWidth(width: number) {
  observers.clear();
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
}

/** Resizes the container of an already rendered app, as a window or pane
 *  resize would. */
export function resizeViewport(width: number) {
  vi.stubGlobal("innerWidth", width);
  act(() => observers.forEach((o) => o.fire(width)));
}

/** How many ResizeObservers are still connected (for unmount checks). */
export function liveObservers(): number {
  return observers.size;
}
