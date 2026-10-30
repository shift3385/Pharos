import { describe, it, expect } from "vitest";
import { computePosition } from "./popoverPosition";

const viewport = { width: 1000, height: 800 };
const rect = (left: number, top: number, width = 100, height = 40) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

describe("computePosition (SPEC §6)", () => {
  it("opens below the trigger with a 6 px gap when it fits", () => {
    const p = computePosition(rect(100, 100), { width: 240, height: 200 }, "bottom-start", viewport);
    expect(p.direction).toBe("down");
    expect(p.style).toMatchObject({ top: 146, left: 100 });
  });

  it("opens up when it does not fit below and there is more room above", () => {
    const p = computePosition(rect(100, 700), { width: 240, height: 300 }, "bottom-start", viewport);
    expect(p.direction).toBe("up");
    expect(p.style).toMatchObject({ bottom: 106 });
    expect(p.style.top).toBeUndefined();
  });

  it("caps the height to the visible room, never below 120 px", () => {
    const tall = computePosition(rect(100, 100), { width: 240, height: 2000 }, "bottom-start", viewport);
    expect(tall.direction).toBe("down");
    expect(tall.style.maxHeight).toBe(800 - 140 - 6 - 8);
    const cramped = computePosition(rect(100, 30, 100, 740), { width: 240, height: 500 }, "bottom-start", viewport);
    expect(cramped.style.maxHeight).toBe(120);
    // …pushed back inside the window instead of overflowing it.
    const bottom = cramped.direction === "down"
      ? Number(cramped.style.top) + 120
      : 800 - Number(cramped.style.bottom);
    expect(bottom).toBeLessThanOrEqual(800 - 8);
    expect(Number(cramped.style.top ?? 8)).toBeGreaterThanOrEqual(8);
  });

  it("shifts inwards with an 8 px margin instead of leaving the window", () => {
    const right = computePosition(rect(900, 100), { width: 240, height: 100 }, "bottom-start", viewport);
    expect(right.style.left).toBe(1000 - 240 - 8);
    const left = computePosition(rect(0, 100, 40), { width: 240, height: 100 }, "bottom-end", viewport);
    expect(left.style.left).toBe(8);
  });

  it("is never wider than the window minus 16 px", () => {
    const p = computePosition(rect(10, 100), { width: 500, height: 100 }, "bottom-start", {
      width: 320,
      height: 568,
    });
    expect(p.style.maxWidth).toBe(304);
    expect(p.style.left).toBe(8);
  });

  it("top-start prefers opening up (user menu at the sidebar foot)", () => {
    const p = computePosition(rect(14, 740), { width: 240, height: 300 }, "top-start", viewport);
    expect(p.direction).toBe("up");
  });

  it("right-end opens to the right, bottom-aligned (user menu from the strip)", () => {
    const p = computePosition(rect(24, 700, 36, 36), { width: 240, height: 300 }, "right-end", viewport);
    expect(p.direction).toBe("right");
    expect(p.style).toMatchObject({ left: 72, top: 736 - 300 });
  });
});
