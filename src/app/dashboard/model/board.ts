// The board of Inicio (UX-26): a 24 × 24 grid of gadgets the user moves,
// resizes and hides. Pure functions over a `Board`; the pointer goes through
// react-grid-layout and the keyboard through these, with the same vertical
// compaction (the library's own `verticalCompactor`), so both
// leave similar layouts. The 24 rows are what fits on screen; a layout may go
// further down (Inicio then scrolls, and «Personalizar» says so) up to
// `MAX_ROWS`, so a full board can still be rearranged.

import type { TFunction } from "i18next";
import { verticalCompactor, type LayoutItem } from "react-grid-layout";

export const BOARD_COLS = 24;
/** Rows that fit on screen: the row height is computed for them. */
export const BOARD_ROWS = 24;
/** The most rows a layout may reach. */
export const MAX_ROWS = 48;
/** Version of the stored format; `readBoard` migrates older ones (1: the
 *  UX-28 board before «Tendencia de ciclos», DOC-06). */
export const BOARD_VERSION = 2;

/** Every gadget, in the default order (also the order they stack in when the
 *  view is too narrow for the grid). */
export const GADGETS = [
  "kpiProjects",
  "kpiPending",
  "kpiRate",
  "kpiDefects",
  "byProject",
  "upcoming",
  "exitCriteria",
  "daily",
  "trend",
] as const;

export type GadgetId = (typeof GADGETS)[number];

export interface CellSize {
  w: number;
  h: number;
}

export interface BoardItem extends CellSize {
  id: GadgetId;
  /** Column, from 0. */
  x: number;
  /** Row, from 0. */
  y: number;
}

export interface Board {
  version: typeof BOARD_VERSION;
  /** The visible gadgets; never overlapping, all inside the 24 × 24 grid. */
  items: BoardItem[];
  /** Hidden gadgets keep their size for when they come back. */
  hidden: ({ id: GadgetId } & CellSize)[];
}

/** The smallest size at which each gadget's essential content fits with no
 *  scroll of its own (UX-28), measured on the narrowest, shortest board: 1280
 *  px wide with the sidebar open (one column ≈ 29 px) and the compact rows of
 *  a ~700 px window (14 px). Lists then show at least one row and «+N más»:
 *  - indicator: icon and name, the number, its note;
 *  - «Ejecución por proyecto»: title, legend dots, one project, «+N más»;
 *  - «Próximas pruebas»: title, the three tabs side by side, one case;
 *  - «Criterios de salida»: title and project, the ring with its verdict,
 *    one criterion;
 *  - «Ejecuciones diarias»: title and total, the chart, «Ver los datos». */
export const MIN_SIZE: Record<GadgetId, CellSize> = {
  kpiProjects: { w: 5, h: 4 },
  kpiPending: { w: 5, h: 4 },
  kpiRate: { w: 5, h: 4 },
  kpiDefects: { w: 5, h: 4 },
  byProject: { w: 8, h: 7 },
  upcoming: { w: 7, h: 9 },
  exitCriteria: { w: 7, h: 11 },
  daily: { w: 8, h: 8 },
  trend: { w: 8, h: 7 },
};

/** The UX-28 default (the layout the user saved on 2026-11-10), before
 *  DOC-06: a stored board equal to it moves to today's default. */
const V1_DEFAULT_ITEMS: readonly BoardItem[] = [
  { id: "kpiProjects", x: 0, y: 0, w: 6, h: 4 },
  { id: "kpiPending", x: 6, y: 0, w: 6, h: 4 },
  { id: "kpiRate", x: 12, y: 0, w: 6, h: 4 },
  { id: "kpiDefects", x: 18, y: 0, w: 6, h: 4 },
  { id: "byProject", x: 0, y: 4, w: 9, h: 10 },
  { id: "upcoming", x: 9, y: 4, w: 7, h: 19 },
  { id: "exitCriteria", x: 16, y: 4, w: 8, h: 19 },
  { id: "daily", x: 0, y: 14, w: 9, h: 9 },
];

/** The default (UX-28, with DOC-06's option A approved on 2026-11-11): four
 *  indicators on top; «Ejecución por proyecto» with «Ejecuciones diarias»
 *  under it on the left; «Próximas pruebas» and «Criterios de salida» in
 *  the middle and on the right, 11 rows each, and «Tendencia de ciclos»
 *  under both. Every gadget shows and it still takes 23 of the 24 rows: no
 *  page scroll. */
const DEFAULT_ITEMS: readonly BoardItem[] = [
  { id: "kpiProjects", x: 0, y: 0, w: 6, h: 4 },
  { id: "kpiPending", x: 6, y: 0, w: 6, h: 4 },
  { id: "kpiRate", x: 12, y: 0, w: 6, h: 4 },
  { id: "kpiDefects", x: 18, y: 0, w: 6, h: 4 },
  { id: "byProject", x: 0, y: 4, w: 9, h: 10 },
  { id: "upcoming", x: 9, y: 4, w: 7, h: 11 },
  { id: "exitCriteria", x: 16, y: 4, w: 8, h: 11 },
  { id: "daily", x: 0, y: 14, w: 9, h: 9 },
  { id: "trend", x: 9, y: 15, w: 15, h: 8 },
];

export function defaultSize(id: GadgetId): CellSize {
  const d = DEFAULT_ITEMS.find((i) => i.id === id)!;
  return { w: d.w, h: d.h };
}

export function defaultBoard(): Board {
  return {
    version: BOARD_VERSION,
    items: DEFAULT_ITEMS.map((i) => ({ ...i })),
    hidden: [],
  };
}

export const isGadget = (v: unknown): v is GadgetId =>
  typeof v === "string" && (GADGETS as readonly string[]).includes(v);

const overlaps = (a: BoardItem, b: BoardItem) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The lowest row any item reaches. */
export const boardBottom = (items: readonly BoardItem[]) =>
  items.reduce((m, i) => Math.max(m, i.y + i.h), 0);

/** Inside the grid, at least its minimum and overlapping nothing. */
export function isValidLayout(items: readonly BoardItem[]): boolean {
  return items.every(
    (it, n) =>
      it.x >= 0 &&
      it.y >= 0 &&
      it.x + it.w <= BOARD_COLS &&
      it.y + it.h <= MAX_ROWS &&
      it.w >= MIN_SIZE[it.id].w &&
      it.h >= MIN_SIZE[it.id].h &&
      items.slice(n + 1).every((o) => !overlaps(it, o)),
  );
}

/** «Ejecución por proyecto: columna 1, fila 5, 10×10» (1-based, as read). */
export function placeText(name: string, i: BoardItem, t: TFunction): string {
  return t("dashboard.board.place", { name, col: i.x + 1, row: i.y + 1, w: i.w, h: i.h });
}

/** Reading order: by row, then by column. */
export function readingOrder(items: readonly BoardItem[]): BoardItem[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The first place (top to bottom, left to right) where `size` fits within
 *  `rows`. */
export function firstGap(
  items: readonly BoardItem[],
  size: CellSize,
  rows = MAX_ROWS,
): { x: number; y: number } | null {
  for (let y = 0; y + size.h <= rows; y++)
    for (let x = 0; x + size.w <= BOARD_COLS; x++) {
      const probe = { id: "kpiProjects" as GadgetId, x, y, ...size };
      if (items.every((i) => !overlaps(i, probe))) return { x, y };
    }
  return null;
}

/** Places a gadget in the first gap of the 24 rows, at `size` or else at its
 *  minimum; null when there is none. */
function placeOnScreen(items: readonly BoardItem[], id: GadgetId, size: CellSize): BoardItem | null {
  for (const s of [size, MIN_SIZE[id]]) {
    const at = firstGap(items, s, BOARD_ROWS);
    if (at) return { id, ...at, ...s };
  }
  return null;
}

/** Places a gadget in the first gap on screen (the 24 rows): at `size`, or
 *  else at its minimum; with no room there, below the rest. */
function placeInGap(
  items: readonly BoardItem[],
  id: GadgetId,
  size: CellSize,
): BoardItem | null {
  for (const rows of [BOARD_ROWS, MAX_ROWS])
    for (const s of [size, MIN_SIZE[id]]) {
      const at = firstGap(items, s, rows);
      if (at) return { id, ...at, ...s };
    }
  return null;
}

// ---- react-grid-layout bridge ----

const toRgl = (items: readonly BoardItem[]): LayoutItem[] =>
  items.map(({ id, x, y, w, h }) => ({
    i: id,
    x,
    y,
    w,
    h,
    minW: MIN_SIZE[id].w,
    minH: MIN_SIZE[id].h,
  }));

const fromRgl = (layout: readonly LayoutItem[]): BoardItem[] =>
  layout
    .filter((l) => isGadget(l.i))
    .map((l) => ({ id: l.i as GadgetId, x: l.x, y: l.y, w: l.w, h: l.h }));

/** The library's vertical compaction: every gadget rises as far as it can. */
export function compact(items: readonly BoardItem[]): BoardItem[] {
  return fromRgl(verticalCompactor.compact(toRgl(items), BOARD_COLS));
}

/** The grid layout react-grid-layout draws (with each gadget's minimum). */
export const gridLayout = (board: Board): LayoutItem[] => toRgl(board.items);

/** A layout coming back from react-grid-layout after a drag or a resize:
 *  the new board, or null when it breaks the grid (the 24 rows, a minimum). */
export function fromGrid(board: Board, layout: readonly LayoutItem[]): Board | null {
  const items = fromRgl(layout);
  if (items.length !== board.items.length || !isValidLayout(items)) return null;
  return { ...board, items };
}

// ---- Keyboard ----

const same = (a: BoardItem | undefined, b: BoardItem | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** The neighbour a one-cell step runs into when both line up (same row and
 *  height for a step aside, same column and width for a step up or down):
 *  the two swap places, as reordering the indicators asks. */
function swapWith(board: Board, item: BoardItem, dx: number, dy: number): BoardItem[] | null {
  const n = board.items.find((o) =>
    dx > 0
      ? o.y === item.y && o.h === item.h && o.x === item.x + item.w
      : dx < 0
        ? o.y === item.y && o.h === item.h && o.x + o.w === item.x
        : dy > 0
          ? o.x === item.x && o.w === item.w && o.y === item.y + item.h
          : o.x === item.x && o.w === item.w && o.y + o.h === item.y,
  );
  if (!n) return null;
  const first = dx + dy > 0 ? item : n; // the one on the left (or above)
  const second = first === item ? n : item;
  const placed = (o: BoardItem): BoardItem =>
    o === second
      ? { ...o, x: dx ? first.x : o.x, y: dy ? first.y : o.y }
      : {
          ...o,
          x: dx ? first.x + second.w : o.x,
          y: dy ? first.y + second.h : o.y,
        };
  const items = compact(
    board.items.map((o) => (o === item || o === n ? placed(o) : o)),
  );
  return isValidLayout(items) ? items : null;
}

/** Moves a gadget one cell (arrows). A lined-up neighbour swaps places with
 *  it; any other gadget in the way makes room and everything rises again.
 *  Null when it cannot move (an edge, or past `MAX_ROWS`). */
export function moveBy(board: Board, id: GadgetId, dx: number, dy: number): Board | null {
  const item = board.items.find((i) => i.id === id);
  if (!item) return null;
  const x = item.x + dx;
  if (x < 0 || x + item.w > BOARD_COLS || item.y + dy < 0) return null;
  const swapped = swapWith(board, item, dx, dy);
  if (swapped) return { ...board, items: swapped };
  const rest = compact(board.items.filter((i) => i.id !== id));
  const across = (o: BoardItem) => o.x < item.x + item.w && item.x < o.x + o.w;
  let y = item.y;
  // Gadgets always rise as far as they can, so one row up or down would come
  // straight back: a step up or down jumps past the gadget above or below,
  // as dropping it there with the pointer does.
  if (dy > 0) {
    const below = rest
      .filter((o) => across(o) && o.y >= item.y)
      .sort((a, b) => a.y - b.y)[0];
    if (!below) return null;
    y = below.y + below.h;
  } else if (dy < 0) {
    const above = rest
      .filter((o) => across(o) && o.y + o.h <= item.y)
      .sort((a, b) => b.y + b.h - (a.y + a.h))[0];
    if (!above) return null;
    y = above.y;
  }
  if (y + item.h > MAX_ROWS) return null;
  const settled = settle({ ...item, x, y }, rest);
  if (!settled) return null;
  const items = compact(settled);
  return isValidLayout(items) && !same(items.find((i) => i.id === id), item)
    ? { ...board, items }
    : null;
}

/** Resizes a gadget one cell (Shift + arrows), never under its minimum.
 *  What it now covers moves down; null when that does not fit. */
export function resizeBy(board: Board, id: GadgetId, dw: number, dh: number): Board | null {
  const item = board.items.find((i) => i.id === id);
  if (!item) return null;
  const min = MIN_SIZE[id];
  const w = item.w + dw;
  const h = item.h + dh;
  if (w < min.w || h < min.h || item.x + w > BOARD_COLS || item.y + h > MAX_ROWS)
    return null;
  // The resized gadget keeps its place: it goes first, the rest settle below.
  const resized = { ...item, w, h };
  const rest = board.items.filter((i) => i.id !== id);
  const items = settle(resized, rest);
  return items ? { ...board, items } : null;
}

/** Puts `fixed` where it is and lets the others rise around it, pushing down
 *  whatever it covers. */
function settle(fixed: BoardItem, rest: readonly BoardItem[]): BoardItem[] | null {
  const layout = [
    { ...toRgl([fixed])[0], static: true },
    ...toRgl(rest),
  ];
  const items = fromRgl(verticalCompactor.compact(layout, BOARD_COLS));
  return isValidLayout(items) ? items : null;
}

// ---- Hide, show, reset ----

export function hideGadget(board: Board, id: GadgetId): Board {
  const item = board.items.find((i) => i.id === id);
  if (!item) return board;
  return {
    ...board,
    items: compact(board.items.filter((i) => i.id !== id)),
    hidden: [...board.hidden, { id, w: item.w, h: item.h }],
  };
}

/** Shows a hidden gadget in the first gap where it fits (at its last size,
 *  or at its minimum); null when there is no room for it. */
export function showGadget(board: Board, id: GadgetId): Board | null {
  const was = board.hidden.find((h) => h.id === id);
  if (!was) return null;
  const placed = placeInGap(board.items, id, { w: was.w, h: was.h });
  if (!placed) return null;
  return {
    ...board,
    items: compact([...board.items, placed]),
    hidden: board.hidden.filter((h) => h.id !== id),
  };
}

// ---- Reading a stored board (migration) ----

const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;

function clampSize(id: GadgetId, w: number, h: number): CellSize {
  const min = MIN_SIZE[id];
  return {
    w: Math.min(BOARD_COLS, Math.max(min.w, w)),
    h: Math.min(BOARD_ROWS, Math.max(min.h, h)),
  };
}

/** Reads a stored board, whatever came: a missing or unreadable one is the
 *  default; a gadget the board does not know yet (added in a later version)
 *  goes to the first gap on screen, or waits hidden when the 24 rows are
 *  full (`waiting`: Inicio says so once, never scrolls for it, DOC-06 D6);
 *  unknown gadgets are dropped; sizes are kept within the minimum and the
 *  grid; overlaps settle. A version-1 board equal to its default becomes
 *  today's default. `changed` says the result differs from what was
 *  stored (save it back). */
export function readBoard(raw: unknown): { board: Board; changed: boolean; waiting: GadgetId[] } {
  if (!raw || typeof raw !== "object") return { board: defaultBoard(), changed: false, waiting: [] };
  const r = raw as { version?: unknown; items?: unknown; hidden?: unknown };
  // A format from a newer app: not ours to read or rewrite.
  if (r.version !== BOARD_VERSION && r.version !== 1)
    return { board: defaultBoard(), changed: false, waiting: [] };
  if (
    r.version === 1 &&
    sameBoard({ version: 1 as typeof BOARD_VERSION, items: [...V1_DEFAULT_ITEMS], hidden: [] }, raw)
  )
    return { board: defaultBoard(), changed: true, waiting: [] };
  const seen = new Set<GadgetId>();
  const hidden: Board["hidden"] = [];
  for (const h of Array.isArray(r.hidden) ? r.hidden : []) {
    const id = (h as { id?: unknown })?.id;
    if (!isGadget(id) || seen.has(id)) continue;
    seen.add(id);
    const d = defaultSize(id);
    const w = int((h as { w?: unknown }).w) ?? d.w;
    const hh = int((h as { h?: unknown }).h) ?? d.h;
    hidden.push({ id, ...clampSize(id, w, hh) });
  }
  const wanted: BoardItem[] = [];
  for (const i of Array.isArray(r.items) ? r.items : []) {
    const o = i as Record<string, unknown>;
    const id = o?.id;
    const x = int(o?.x);
    const y = int(o?.y);
    const w = int(o?.w);
    const h = int(o?.h);
    if (!isGadget(id) || seen.has(id) || x === null || y === null || w === null || h === null)
      continue;
    seen.add(id);
    const size = clampSize(id, w, h);
    wanted.push({
      id,
      ...size,
      x: Math.min(Math.max(0, x), BOARD_COLS - size.w),
      y: Math.max(0, y),
    });
  }
  // Each where it was, keeping its size: what overlaps (a size raised to a
  // new minimum, a broken record) settles below, as the compaction does. A
  // gadget pushed past the last row waits among the hidden ones.
  const items: BoardItem[] = [];
  for (const it of compact(wanted)) {
    if (it.y + it.h <= MAX_ROWS) items.push(it);
    else hidden.push({ id: it.id, w: it.w, h: it.h });
  }
  // Gadgets the stored board never knew: on screen if they fit, never
  // below it.
  const waiting: GadgetId[] = [];
  for (const id of GADGETS) {
    if (seen.has(id)) continue;
    const placed = placeOnScreen(items, id, defaultSize(id));
    if (placed) items.push(placed);
    else {
      hidden.push({ id, ...defaultSize(id) });
      waiting.push(id);
    }
  }
  const board: Board = { version: BOARD_VERSION, items: compact(items), hidden };
  return { board, changed: !sameBoard(board, raw), waiting };
}

/** Same gadgets in the same places, and the same hidden ones. */
export function sameBoard(a: Board, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b as Board));
}

function canonical(b: Board) {
  const items = Array.isArray(b?.items) ? b.items : [];
  const hidden = Array.isArray(b?.hidden) ? b.hidden : [];
  return {
    version: b?.version,
    items: [...items]
      .map(({ id, x, y, w, h }) => ({ id, x, y, w, h }))
      .sort((p, q) => String(p.id).localeCompare(String(q.id))),
    hidden: [...hidden]
      .map(({ id, w, h }) => ({ id, w, h }))
      .sort((p, q) => String(p.id).localeCompare(String(q.id))),
  };
}
