import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";

/** True inside a gadget of the desktop board (UX-28): its height is fixed by
 *  the grid, so its lists show only the rows that fit. Elsewhere (tablet,
 *  mobile) cards grow with their content and show every row. */
export const GadgetFitContext = createContext(false);

/** Height of «+N más» (`.home-more`: a 16 px line and 6 px above it). */
const MORE_HEIGHT = 22;

/**
 * How many rows of a list fit in a gadget (UX-28: never a scroll inside a
 * gadget). `boxRef` is the area the list may use (it holds the list and its
 * «+N más»; on the board it takes the card's free height and hides what does
 * not fit), `listRef` the list, whose rows are one line each. It measures the
 * first row and the box, again whenever the box changes size, and returns
 * how many rows to draw and how many are left for «+N más». With no layout
 * (tests, before the first paint) every row shows.
 */
export function useFitRows(total: number) {
  const fit = useContext(GadgetFitContext);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rowHeight = useRef(0);
  const [shown, setShown] = useState(total);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!fit || !box) {
      setShown(total);
      return;
    }
    const measure = () => {
      const free = box.clientHeight;
      if (!free) return setShown(total);
      const list = listRef.current;
      const gap = list ? parseFloat(getComputedStyle(list).rowGap) || 0 : 0;
      const first = list?.firstElementChild as HTMLElement | null | undefined;
      if (first) rowHeight.current = first.getBoundingClientRect().height + gap;
      const per = rowHeight.current;
      if (!per) return setShown(total);
      let n = Math.floor((free + gap) / per);
      if (n < total) n = Math.max(0, Math.floor((free - MORE_HEIGHT + gap) / per));
      setShown(Math.min(total, n));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [fit, total]);

  const count = fit ? Math.min(shown, total) : total;
  return { fit, boxRef, listRef, shown: count, more: total - count };
}
