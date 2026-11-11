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

describe("Inicio board (UX-27, default of UX-28)", () => {
  it("defaults to the layout the user saved, in 23 of the 24 rows", () => {
    const b = defaultBoard();
    expect(at(b, "kpiProjects")).toEqual({ x: 0, y: 0, w: 6, h: 4 });
    expect(at(b, "kpiPending")).toEqual({ x: 6, y: 0, w: 6, h: 4 });
    expect(at(b, "kpiRate")).toEqual({ x: 12, y: 0, w: 6, h: 4 });
    expect(at(b, "kpiDefects")).toEqual({ x: 18, y: 0, w: 6, h: 4 });
    expect(at(b, "byProject")).toEqual({ x: 0, y: 4, w: 9, h: 10 });
    expect(at(b, "daily")).toEqual({ x: 0, y: 14, w: 9, h: 9 });
    expect(at(b, "upcoming")).toEqual({ x: 9, y: 4, w: 7, h: 19 });
    expect(at(b, "exitCriteria")).toEqual({ x: 16, y: 4, w: 8, h: 19 });
    expect(b.hidden).toEqual([]);
    expect(isValidLayout(b.items)).toBe(true);
    expect(boardBottom(b.items)).toBe(23);
    expect(boardBottom(b.items)).toBeLessThanOrEqual(BOARD_ROWS);
    // A stored default reads back unchanged: compaction keeps it as it is.
    expect(readBoard(defaultBoard())).toEqual({ board: b, changed: false });
  });

  it("keeps every default size at or over its minimum", () => {
    for (const i of defaultBoard().items) {
      expect(i.w, i.id).toBeGreaterThanOrEqual(MIN_SIZE[i.id].w);
      expect(i.h, i.id).toBeGreaterThanOrEqual(MIN_SIZE[i.id].h);
    }
  });

  it("never resizes a gadget under its minimum", () => {
    let b = defaultBoard();
    for (let n = 0; n < 10; n++) b = resizeBy(b, "kpiRate", -1, 0) ?? b;
    expect(at(b, "kpiRate")).toMatchObject({ w: MIN_SIZE.kpiRate.w });
    expect(resizeBy(b, "kpiRate", -1, 0)).toBeNull();
    expect(resizeBy(b, "kpiRate", 0, -1)).toBeNull();
    // Nor through the pointer: react-grid-layout gets each minimum…
    expect(gridLayout(b).find((l) => l.i === "byProject")).toMatchObject({ minW: 8, minH: 7 });
    // …and a layout under it is refused.
    const shrunk = gridLayout(b).map((l) => (l.i === "daily" ? { ...l, h: 3 } : l));
    expect(fromGrid(b, shrunk)).toBeNull();
    // A stored size under the minimum is raised to it.
    const stored = defaultBoard();
    stored.items[4] = { ...stored.items[4], w: 2, h: 2 };
    expect(at(readBoard(stored).board, "byProject")).toMatchObject({ w: 8, h: 7 });
  });

  it("moves with arrows: a lined-up neighbour swaps, others make way, edges stop it", () => {
    const b = defaultBoard();
    expect(moveBy(b, "kpiProjects", -1, 0)).toBeNull();
    expect(moveBy(b, "kpiProjects", 0, -1)).toBeNull();
    expect(moveBy(b, "kpiDefects", 1, 0)).toBeNull();
    expect(moveBy(b, "exitCriteria", 1, 0)).toBeNull();
    // Two indicators side by side swap places.
    const right = moveBy(b, "kpiProjects", 1, 0)!;
    expect(at(right, "kpiPending")).toEqual({ x: 0, y: 0, w: 6, h: 4 });
    expect(at(right, "kpiProjects")).toEqual({ x: 6, y: 0, w: 6, h: 4 });
    expect(at(moveBy(right, "kpiProjects", -1, 0)!, "kpiProjects")).toMatchObject({ x: 0 });
    // A gadget in the way makes room below, and nothing ever overlaps.
    // «Próximas pruebas» and «Criterios de salida» line up: they swap too.
    const swapped = moveBy(b, "upcoming", 1, 0)!;
    expect(at(swapped, "exitCriteria")).toMatchObject({ x: 9, y: 4 });
    expect(at(swapped, "upcoming")).toMatchObject({ x: 17, y: 4 });
    // A gadget in the way makes room below, and nothing ever overlaps.
    const aside = moveBy(b, "daily", 1, 0)!;
    expect(at(aside, "daily")).toMatchObject({ x: 1, y: 14 });
    expect(at(aside, "upcoming")!.y).toBeGreaterThanOrEqual(23);
    expect(isValidLayout(aside.items)).toBe(true);
    // Down: the gadget lands under what was below it, and up brings it back.
    const down = moveBy(b, "byProject", 0, 1)!;
    expect(isValidLayout(down.items)).toBe(true);
    expect(at(down, "daily")!.y).toBe(4);
    expect(at(down, "byProject")!.y).toBe(13);
    const up = moveBy(down, "byProject", 0, -1)!;
    expect(at(up, "byProject")).toEqual({ x: 0, y: 4, w: 9, h: 10 });
    expect(at(up, "daily")).toEqual({ x: 0, y: 14, w: 9, h: 9 });
  });

  it("resizes with Shift + arrows, pushing what it covers down", () => {
    const small = resizeBy(defaultBoard(), "byProject", 0, -2)!;
    expect(at(small, "byProject")).toEqual({ x: 0, y: 4, w: 9, h: 8 });
    expect(at(small, "daily")!.y).toBe(12);
    // Wider: «Próximas pruebas» is covered and goes below it.
    const wide = resizeBy(defaultBoard(), "byProject", 1, 0)!;
    expect(at(wide, "byProject")).toEqual({ x: 0, y: 4, w: 10, h: 10 });
    expect(at(wide, "upcoming")!.y).toBe(14);
    expect(isValidLayout(wide.items)).toBe(true);
    // Narrower again: everything rises back.
    const back = resizeBy(wide, "byProject", -1, 0)!;
    expect(back.items).toEqual(expect.arrayContaining(defaultBoard().items));
    // Past the right edge: refused.
    expect(resizeBy(defaultBoard(), "kpiDefects", 1, 0)).toBeNull();
  });

  it("hides a gadget, the rest rise, and it comes back in the first gap", () => {
    const hidden = hideGadget(defaultBoard(), "exitCriteria");
    expect(at(hidden, "exitCriteria")).toBeUndefined();
    expect(hidden.hidden).toEqual([{ id: "exitCriteria", w: 8, h: 19 }]);
    const shown = showGadget(hidden, "exitCriteria")!;
    expect(at(shown, "exitCriteria")).toEqual({ x: 16, y: 4, w: 8, h: 19 });
    expect(shown.hidden).toEqual([]);
    expect(isValidLayout(shown.items)).toBe(true);
  });

  it("shows a hidden gadget at its minimum where its size no longer fits, else below", () => {
    let b = hideGadget(defaultBoard(), "exitCriteria");
    b = resizeBy(b, "upcoming", 1, 0)!; // 7 columns left: its minimum width
    const shown = showGadget(b, "exitCriteria")!;
    expect(at(shown, "exitCriteria")).toEqual({ x: 17, y: 4, w: 7, h: 11 });
    b = resizeBy(b, "upcoming", 1, 0)!; // 6 columns left
    const below = showGadget(b, "exitCriteria")!;
    expect(at(below, "exitCriteria")).toMatchObject({ x: 0, y: 23, w: 8, h: 19 });
    expect(boardBottom(below.items)).toBeGreaterThan(BOARD_ROWS);
  });

  it("migrates a stored board without a newer gadget into the first gap", () => {
    const old = hideGadget(defaultBoard(), "exitCriteria");
    // As a board saved before «Criterios de salida» existed would read.
    const stored = { version: 1, items: old.items, hidden: [] };
    const { board, changed } = readBoard(stored);
    expect(changed).toBe(true);
    expect(at(board, "exitCriteria")).toEqual({ x: 16, y: 4, w: 8, h: 19 });
    expect(board.hidden).toEqual([]);
    // A gadget the user hid stays hidden: only unknown ones are added.
    expect(readBoard(old)).toEqual({ board: old, changed: false });
  });

  it("keeps a board saved with the UX-27 default, raising what is under a new minimum", () => {
    const ux27 = {
      version: 1,
      items: [
        { id: "kpiProjects", x: 0, y: 0, w: 6, h: 4 },
        { id: "kpiPending", x: 6, y: 0, w: 6, h: 4 },
        { id: "kpiRate", x: 12, y: 0, w: 6, h: 4 },
        { id: "kpiDefects", x: 18, y: 0, w: 6, h: 4 },
        { id: "byProject", x: 0, y: 4, w: 10, h: 10 },
        { id: "exitCriteria", x: 10, y: 4, w: 7, h: 10 },
        { id: "upcoming", x: 17, y: 4, w: 7, h: 20 },
        { id: "daily", x: 0, y: 14, w: 17, h: 10 },
      ],
      hidden: [],
    };
    const { board } = readBoard(ux27);
    expect(at(board, "byProject")).toEqual({ x: 0, y: 4, w: 10, h: 10 });
    expect(at(board, "upcoming")).toEqual({ x: 17, y: 4, w: 7, h: 20 });
    // 7×10 is under the new 7×11: it grows in place and «Ejecuciones
    // diarias» settles one row lower, its size kept.
    expect(at(board, "exitCriteria")).toEqual({ x: 10, y: 4, w: 7, h: 11 });
    expect(at(board, "daily")).toEqual({ x: 0, y: 15, w: 17, h: 10 });
    expect(isValidLayout(board.items)).toBe(true);
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
    expect(order).toEqual([...GADGETS]);
    expect(order).toEqual([
      "kpiProjects",
      "kpiPending",
      "kpiRate",
      "kpiDefects",
      "byProject",
      "upcoming",
      "exitCriteria",
      "daily",
    ]);
  });
});
