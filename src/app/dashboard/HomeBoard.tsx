import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { GridLayout, type Layout } from "react-grid-layout";
import { EyeOff, GripVertical } from "lucide-react";
import "react-grid-layout/css/styles.css";
import { GadgetFitContext } from "./model/fitRows";
import {
  BOARD_COLS,
  BOARD_ROWS,
  MAX_ROWS,
  MIN_SIZE,
  fromGrid,
  gridLayout,
  moveBy,
  placeText,
  readingOrder,
  resizeBy,
  type Board,
  type GadgetId,
} from "./model/board";

/** Space between gadgets, in px: [between columns, between rows]. */
const BOARD_GAP: [number, number] = [12, 8];
/** Rows never get shorter than this (UX-28): it is the height at which every
 *  gadget's minimum still fits its essentials, compacted. A window under
 *  about 700 px tall gets one page scroll instead. */
export const MIN_ROW_HEIGHT = 14;
/** Under this row height the board is compact (UX-28): tighter cards,
 *  legends as dots, no foot text under the daily chart. At 1280 × 820 a row
 *  is about 19 px; at 1440 × 900, 22 px. */
export const COMPACT_BELOW = 18;
/** Width used before the first measurement (and in tests, without layout). */
const FALLBACK_WIDTH = 1000;

/** Height of one row so that the 24 rows fill what is left of the content
 *  area under the board's top (desktop, from 1280 × 800: no scroll). */
function useRowHeight(
  boardRef: RefObject<HTMLDivElement | null>,
  watchRef: RefObject<HTMLElement | null>,
) {
  const [rowHeight, setRowHeight] = useState(MIN_ROW_HEIGHT);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const scroller = board.closest<HTMLElement>(".app-shell__content");
    const page = board.closest<HTMLElement>(".app-shell__page");
    const measure = () => {
      const w = board.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.floor(w));
      const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
      const viewHeight = scroller ? scroller.clientHeight : window.innerHeight;
      const top = board.getBoundingClientRect().top - viewTop + (scroller?.scrollTop ?? 0);
      const bottomPad = page ? parseFloat(getComputedStyle(page).paddingBottom) || 0 : 0;
      // One pixel spare: rounding must never add a scroll bar.
      const free = viewHeight - top - bottomPad - 1;
      const row = Math.floor((free - BOARD_GAP[1] * (BOARD_ROWS - 1)) / BOARD_ROWS);
      setRowHeight(Math.max(MIN_ROW_HEIGHT, row || 0));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    for (const el of [board, scroller, watchRef.current])
      if (el) observer?.observe(el);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [boardRef, watchRef]);
  return { rowHeight, width };
}

export interface GadgetView {
  id: GadgetId;
  /** The gadget's name, for its controls and announcements. */
  name: string;
  content: ReactNode;
}

/** The board of Inicio on the desktop (UX-27): the gadgets on a 24 × 24 grid.
 *  While `editing`, each gadget is moved by its handle or with the arrows,
 *  resized from its corner or with Shift + arrows, and hidden with its eye;
 *  every change comes back through `onChange` (or `onRefuse`, when it cannot
 *  be made) and nothing overlaps. */
export function HomeBoard({
  board,
  gadgets,
  editing,
  watchRef,
  onChange,
  onRefuse,
  onHide,
}: {
  board: Board;
  gadgets: Record<GadgetId, GadgetView>;
  editing: boolean;
  /** The header above: when its height changes, the rows are measured again. */
  watchRef: RefObject<HTMLElement | null>;
  onChange: (board: Board, moved: GadgetId) => void;
  onRefuse: (id: GadgetId) => void;
  onHide: (id: GadgetId) => void;
}) {
  const { t } = useTranslation();
  const boardRef = useRef<HTMLDivElement>(null);
  const { rowHeight, width } = useRowHeight(boardRef, watchRef);
  // Remounts the grid after a refused drag, so it lets go of the layout.
  const [gridKey, setGridKey] = useState(0);

  const fromPointer = useCallback(
    (layout: Layout, id: string | undefined) => {
      const next = fromGrid(board, layout);
      const gadget = board.items.find((i) => i.id === id)?.id;
      if (!gadget) return;
      if (next) onChange(next, gadget);
      else {
        setGridKey((k) => k + 1);
        onRefuse(gadget);
      }
    },
    [board, onChange, onRefuse],
  );

  const onKey = (e: KeyboardEvent<HTMLDivElement>, id: GadgetId) => {
    if (!editing || e.target !== e.currentTarget) return;
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const d = dir[e.key];
    if (!d || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const next = e.shiftKey ? resizeBy(board, id, d[0], d[1]) : moveBy(board, id, d[0], d[1]);
    if (next) onChange(next, id);
    else onRefuse(id);
  };

  const cell = {
    "--board-col": `${(width - BOARD_GAP[0] * (BOARD_COLS - 1)) / BOARD_COLS}px`,
    "--board-row": `${rowHeight}px`,
    "--board-gap-x": `${BOARD_GAP[0]}px`,
    "--board-gap-y": `${BOARD_GAP[1]}px`,
  } as React.CSSProperties;

  // DOM order follows reading order, so Tab goes through them as they read.
  const items = readingOrder(board.items);

  return (
    <div
      ref={boardRef}
      className="home-board"
      data-editing={editing || undefined}
      data-compact={rowHeight < COMPACT_BELOW || undefined}
      style={cell}
      data-testid="home-board"
    >
      <GridLayout
        key={gridKey}
        width={width}
        layout={gridLayout(board)}
        gridConfig={{
          cols: BOARD_COLS,
          rowHeight,
          margin: BOARD_GAP,
          containerPadding: [0, 0],
          maxRows: MAX_ROWS,
        }}
        dragConfig={{ enabled: editing, handle: ".home-gadget__handle", threshold: 3 }}
        resizeConfig={{ enabled: editing, handles: ["se"] }}
        onDragStop={(layout, _old, item) => fromPointer(layout, item?.i)}
        onResizeStop={(layout, _old, item) => fromPointer(layout, item?.i)}
      >
        {items.map((item) => {
          const g = gadgets[item.id];
          const min = MIN_SIZE[item.id];
          return (
            <div
              key={item.id}
              className="home-gadget"
              data-gadget={item.id}
              data-testid={`gadget-${item.id}`}
              tabIndex={editing ? 0 : undefined}
              role={editing ? "group" : undefined}
              aria-roledescription={editing ? t("dashboard.board.gadget") : undefined}
              aria-label={editing ? placeText(g.name, item, t) : undefined}
              aria-describedby={editing ? "home-board-help" : undefined}
              onKeyDown={(e) => onKey(e, item.id)}
            >
              <GadgetBody inert={editing}>{g.content}</GadgetBody>
              {editing && (
                <div className="home-gadget__chrome">
                  <span
                    className="home-gadget__handle"
                    title={t("dashboard.board.dragTitle", { name: g.name })}
                    aria-hidden="true"
                  >
                    <GripVertical size={16} />
                  </span>
                  <span className="home-gadget__size" aria-hidden="true">
                    {t("dashboard.board.size", { w: item.w, h: item.h, minW: min.w, minH: min.h })}
                  </span>
                  <button
                    type="button"
                    className="home-gadget__hide"
                    aria-label={t("dashboard.board.hide", { name: g.name })}
                    title={t("dashboard.board.hide", { name: g.name })}
                    onClick={() => onHide(item.id)}
                    data-testid={`hide-${item.id}`}
                  >
                    <EyeOff size={15} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </GridLayout>
    </div>
  );
}

/** A gadget's content; while editing it is inert (no links, no focus), so a
 *  drag never opens what it starts on. */
function GadgetBody({ inert, children }: { inert: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inert) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
  }, [inert]);
  return (
    <div ref={ref} className="home-gadget__body">
      {/* Its lists show the rows that fit, never a scroll (UX-28). */}
      <GadgetFitContext.Provider value={true}>{children}</GadgetFitContext.Provider>
    </div>
  );
}

/** Narrow views (tablet): the visible gadgets one under the other, in
 *  reading order; indicators next to each other share a row. */
export function HomeStack({ board, gadgets }: { board: Board; gadgets: Record<GadgetId, GadgetView> }) {
  const rows: GadgetId[][] = [];
  for (const { id } of readingOrder(board.items)) {
    const last = rows[rows.length - 1];
    if (id.startsWith("kpi") && last?.[0].startsWith("kpi")) last.push(id);
    else rows.push([id]);
  }
  const cell = (id: GadgetId) => (
    <div key={id} className="home-stack__item" data-gadget={id} data-testid={`gadget-${id}`}>
      {gadgets[id].content}
    </div>
  );
  return (
    <div className="home-stack" data-testid="home-stack">
      {rows.map((ids) =>
        ids[0].startsWith("kpi") ? (
          <div key={ids.join()} className="home-kpis">
            {ids.map(cell)}
          </div>
        ) : (
          cell(ids[0])
        ),
      )}
    </div>
  );
}
