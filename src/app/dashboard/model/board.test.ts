import { describe, expect, it } from "vitest";
import {
  BOARD_ROWS,
  GADGETS,
  MIN_SIZE,
  boardBottom,
  defaultBoard,
  fromGrid,
  gridLayout,
  hideGadget,
  isValidLayout,
  moveBy,
  readBoard,
  readingOrder,
  resizeBy,
  showGadget,
  type Board,
  type GadgetId,
} from "./board";

const at = (b: Board, id: GadgetId) => {
  const i = b.items.find((x) => x.id === id);
  return i && { x: i.x, y: i.y, w: i.w, h: i.h };
};

describe("Inicio board (UX-26)", () => {
  it("defaults to the approved layout, filling the 24 rows exactly", () => {
    const b = defaultBoard();
    // 1-based in the approval: column 1, 7, 13, 19, row 1, 6×4.
    expect(at(b, "kpiProjects")).toEqual({ x: 0, y: 0, w: 6, h: 4 });
    expect(at(b, "kpiPending")).toEqual({ x: 6, y: 0, w: 6, h: 4 });
    expect(at(b, "kpiRate")).toEqual({ x: 12, y: 0, w: 6, h: 4 });
    expect(at(b, "kpiDefects")).toEqual({ x: 18, y: 0, w: 6, h: 4 });
    expect(at(b, "byProject")).toEqual({ x: 0, y: 4, w: 10, h: 10 });
    expect(at(b, "exitCriteria")).toEqual({ x: 10, y: 4, w: 7, h: 10 });
    expect(at(b, "upcoming")).toEqual({ x: 17, y: 4, w: 7, h: 20 });
    expect(at(b, "daily")).toEqual({ x: 0, y: 14, w: 17, h: 10 });
    expect(b.hidden).toEqual([]);
    expect(isValidLayout(b.items)).toBe(true);
    expect(boardBottom(b.items)).toBe(BOARD_ROWS);
    // A stored default reads back unchanged: compaction keeps it as it is.
    expect(readBoard(defaultBoard())).toEqual({ board: b, changed: false });
  });

  it("never resizes a gadget under its minimum", () => {
    let b = defaultBoard();
    for (let n = 0; n < 10; n++) b = resizeBy(b, "kpiRate", -1, 0) ?? b;
    expect(at(b, "kpiRate")).toMatchObject({ w: MIN_SIZE.kpiRate.w });
    expect(resizeBy(b, "kpiRate", -1, 0)).toBeNull();
    expect(resizeBy(b, "kpiRate", 0, -1)).toBeNull();
    // Nor through the pointer: react-grid-layout gets each minimum…
    expect(gridLayout(b).find((l) => l.i === "byProject")).toMatchObject({ minW: 8, minH: 6 });
    // …and a layout under it is refused.
    const shrunk = gridLayout(b).map((l) => (l.i === "daily" ? { ...l, h: 3 } : l));
    expect(fromGrid(b, shrunk)).toBeNull();
    // A stored size under the minimum is raised to it.
    const stored = defaultBoard();
    stored.items[4] = { ...stored.items[4], w: 2, h: 2 };
    expect(at(readBoard(stored).board, "byProject")).toMatchObject({ w: 8, h: 6 });
  });

  it("moves with arrows: a lined-up neighbour swaps, others make way, edges stop it", () => {
    const b = defaultBoard();
    expect(moveBy(b, "kpiProjects", -1, 0)).toBeNull();
    expect(moveBy(b, "kpiProjects", 0, -1)).toBeNull();
    expect(moveBy(b, "kpiDefects", 1, 0)).toBeNull();
    // Two indicators side by side swap places.
    const right = moveBy(b, "kpiProjects", 1, 0)!;
    expect(at(right, "kpiPending")).toEqual({ x: 0, y: 0, w: 6, h: 4 });
    expect(at(right, "kpiProjects")).toEqual({ x: 6, y: 0, w: 6, h: 4 });
    expect(at(moveBy(right, "kpiProjects", -1, 0)!, "kpiProjects")).toMatchObject({ x: 0 });
    // A gadget in the way makes room below, and nothing ever overlaps.
    const aside = moveBy(b, "exitCriteria", 1, 0)!;
    expect(at(aside, "exitCriteria")).toMatchObject({ x: 11, y: 4 });
    expect(at(aside, "upcoming")!.y).toBeGreaterThanOrEqual(14);
    expect(isValidLayout(aside.items)).toBe(true);
    // Down: the gadget lands under what was below it.
    const down = moveBy(b, "byProject", 0, 1)!;
    expect(isValidLayout(down.items)).toBe(true);
    expect(at(down, "byProject")!.y).toBeGreaterThan(4);
    const up = moveBy(down, "byProject", 0, -1)!;
    expect(isValidLayout(up.items)).toBe(true);
    expect(at(up, "byProject")!.y).toBeLessThan(at(down, "byProject")!.y);
  });

  it("resizes with Shift + arrows, pushing what it covers down", () => {
    const small = resizeBy(defaultBoard(), "byProject", 0, -2)!;
    expect(at(small, "byProject")).toEqual({ x: 0, y: 4, w: 10, h: 8 });
    // Wider: «Criterios de salida» is covered and goes below it.
    const wide = resizeBy(defaultBoard(), "byProject", 1, 0)!;
    expect(at(wide, "byProject")).toEqual({ x: 0, y: 4, w: 11, h: 10 });
    expect(at(wide, "exitCriteria")!.y).toBe(14);
    expect(at(wide, "daily")!.y).toBe(24);
    expect(isValidLayout(wide.items)).toBe(true);
    // Narrower again: everything rises back.
    const back = resizeBy(wide, "byProject", -1, 0)!;
    expect(isValidLayout(back.items)).toBe(true);
    expect(at(back, "byProject")).toEqual({ x: 0, y: 4, w: 10, h: 10 });
    // Past the right edge: refused.
    expect(resizeBy(defaultBoard(), "kpiDefects", 1, 0)).toBeNull();
  });

  it("hides a gadget, the rest rise, and it comes back in the first gap", () => {
    const hidden = hideGadget(defaultBoard(), "exitCriteria");
    expect(at(hidden, "exitCriteria")).toBeUndefined();
    expect(hidden.hidden).toEqual([{ id: "exitCriteria", w: 7, h: 10 }]);
    const shown = showGadget(hidden, "exitCriteria")!;
    expect(at(shown, "exitCriteria")).toEqual({ x: 10, y: 4, w: 7, h: 10 });
    expect(shown.hidden).toEqual([]);
    expect(isValidLayout(shown.items)).toBe(true);
  });

  it("shows a hidden gadget at its minimum where its size no longer fits, else below", () => {
    let b = hideGadget(defaultBoard(), "exitCriteria");
    b = resizeBy(b, "byProject", 1, 0)!; // 6 columns left: its minimum width
    const shown = showGadget(b, "exitCriteria")!;
    expect(at(shown, "exitCriteria")).toEqual({ x: 11, y: 4, w: 6, h: 8 });
    b = resizeBy(b, "byProject", 4, 0)!; // 15 wide: 2 columns left
    const below = showGadget(b, "exitCriteria")!;
    expect(at(below, "exitCriteria")).toMatchObject({ x: 0, y: 24, w: 7, h: 10 });
    expect(boardBottom(below.items)).toBeGreaterThan(BOARD_ROWS);
  });

  it("migrates a stored board without a newer gadget into the first gap", () => {
    const old = hideGadget(defaultBoard(), "exitCriteria");
    // As a board saved before «Criterios de salida» existed would read.
    const stored = { version: 1, items: old.items, hidden: [] };
    const { board, changed } = readBoard(stored);
    expect(changed).toBe(true);
    expect(at(board, "exitCriteria")).toEqual({ x: 10, y: 4, w: 7, h: 10 });
    expect(board.hidden).toEqual([]);
    // A gadget the user hid stays hidden: only unknown ones are added.
    expect(readBoard(old)).toEqual({ board: old, changed: false });
  });

  it("reads anything else as the default, dropping unknown gadgets and fixing overlaps", () => {
    expect(readBoard(null).board).toEqual(defaultBoard());
    expect(readBoard("x").board).toEqual(defaultBoard());
    // A newer format is not rewritten.
    expect(readBoard({ version: 99 })).toEqual({ board: defaultBoard(), changed: false });
    const messy = {
      version: 1,
      items: [
        ...defaultBoard().items,
        { id: "gone", x: 0, y: 0, w: 3, h: 3 },
        { id: "kpiRate", x: 0, y: 0, w: 6, h: 4 }, // repeated
      ],
      hidden: [],
    };
    const { board } = readBoard(messy);
    expect(board.items.map((i) => i.id).sort()).toEqual([...GADGETS].sort());
    expect(isValidLayout(board.items)).toBe(true);
  });

  it("lists the gadgets in reading order (the stacking order)", () => {
    const order = readingOrder(defaultBoard().items).map((i) => i.id);
    expect(order).toEqual([
      "kpiProjects",
      "kpiPending",
      "kpiRate",
      "kpiDefects",
      "byProject",
      "exitCriteria",
      "upcoming",
      "daily",
    ]);
  });
});
