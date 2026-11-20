import { describe, expect, it } from "vitest";
import { railScrollFor } from "./railScroll";

const box = (top: number, height: number) => ({ top, bottom: top + height, height }) as DOMRect;
const el = (rect: DOMRect, scrollTop = 0) =>
  ({ getBoundingClientRect: () => rect, scrollTop }) as unknown as HTMLElement;

describe("railScrollFor (FIX-44)", () => {
  it("leaves the rail as it is when the current step is already in view", () => {
    expect(railScrollFor(el(box(100, 600), 40), el(box(300, 40)))).toBe(40);
  });

  it("brings a step below the fold to the middle of the rail", () => {
    // Step 22 at 900–940 in a rail from 100 to 700: 800 px further down,
    // less half the room left around it (280 px).
    expect(railScrollFor(el(box(100, 600), 0), el(box(900, 40)))).toBe(520);
  });

  it("never scrolls above the top", () => {
    expect(railScrollFor(el(box(100, 600), 10), el(box(60, 40)))).toBe(0);
  });
});
