import type { CSSProperties } from "react";

/** Where the panel opens relative to its trigger. `bottom-*` flips up when it
 *  does not fit below; `right-end` opens to the right with the bottom edges
 *  aligned (the user menu from the icon strip); `top-start` opens up first
 *  (the user menu from the sidebar foot). */
export type PopoverPlacement = "bottom-start" | "bottom-end" | "top-start" | "right-end";

/** Gap to the trigger (SPEC §6: 6–8 px), margin to the window edges, and the
 *  smallest height a panel keeps before it scrolls inside. */
const GAP = 6;
const EDGE = 8;
const MIN_HEIGHT = 120;

export interface Position {
  style: CSSProperties;
  direction: "up" | "down" | "right";
}

/** Measures the free space around the trigger and places the panel inside the
 *  window: up when it does not fit below and there is more room above, with a
 *  max-height of the visible space (at least 120 px), shifted inwards with an
 *  8 px margin, and never wider than the window minus 16 px. Exported for tests. */
export function computePosition(
  anchor: DOMRect,
  panel: { width: number; height: number },
  placement: PopoverPlacement,
  viewport: { width: number; height: number },
): Position {
  const width = Math.min(panel.width, viewport.width - EDGE * 2);
  const clampLeft = (left: number) =>
    Math.max(EDGE, Math.min(left, viewport.width - width - EDGE));

  if (placement === "right-end") {
    const left = anchor.right + GAP * 2;
    const fitsRight = left + width <= viewport.width - EDGE;
    const maxHeight = Math.max(MIN_HEIGHT, viewport.height - EDGE * 2);
    const height = Math.min(panel.height, maxHeight);
    const top = Math.max(EDGE, Math.min(anchor.bottom - height, viewport.height - height - EDGE));
    return {
      direction: "right",
      style: {
        top,
        left: fitsRight ? left : clampLeft(anchor.left),
        maxHeight,
        maxWidth: viewport.width - EDGE * 2,
      },
    };
  }

  const below = viewport.height - anchor.bottom - GAP - EDGE;
  const above = anchor.top - GAP - EDGE;
  const preferUp = placement === "top-start";
  const up = preferUp
    ? panel.height > above && below > above
      ? false
      : true
    : panel.height > below && above > below;
  const room = up ? above : below;
  const left = clampLeft(placement === "bottom-end" ? anchor.right - width : anchor.left);
  const vertical = up
    ? { bottom: viewport.height - anchor.top + GAP }
    : { top: anchor.bottom + GAP };
  return {
    direction: up ? "up" : "down",
    style: {
      ...vertical,
      left,
      maxHeight: Math.max(MIN_HEIGHT, room),
      maxWidth: viewport.width - EDGE * 2,
    },
  };
}
