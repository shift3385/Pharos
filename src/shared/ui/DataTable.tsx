import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useBreakpoint } from "./useBreakpoint";
import type { Breakpoint } from "./viewport";
import "./dataTable.css";

export type SortDir = "asc" | "desc";
export interface SortState {
  id: string;
  dir: SortDir;
}

export interface DataColumn<T> {
  id: string;
  /** Visible header text (it also names the sort button). */
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Grid track: "96px", "minmax(0,2.6fr)"… Default `minmax(0,1fr)`. */
  width?: string;
  align?: "start" | "end";
  /** The header becomes a sort button; the parent sorts the rows. */
  sortable?: boolean;
  /** Hidden below this view. */
  minView?: Exclude<Breakpoint, "mobile">;
}

export interface DataTableSelection<T> {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Names the row's checkbox: «Seleccionar {rowLabel}». */
  rowLabel: (row: T) => string;
}

const RANK: Record<Breakpoint, number> = { mobile: 0, tablet: 1, desktop: 2 };

/**
 * A data table (SPEC §8 «tabla completa»): a semantic `<table>` laid out as a
 * CSS grid, so every row shares the column tracks. Optional multi-selection
 * (header checkbox with «indeterminate»), sortable headers (`aria-sort`) and,
 * on mobile, a list of cards (`mobileCard`) instead of the table. Rows are
 * never links as a whole: the primary cell holds the link or button that opens
 * the row, so it does not fight the checkbox. Text cells cut with «…»
 * (`TruncatedText`).
 */
export function DataTable<T>({
  rows,
  columns,
  getRowId,
  label,
  selection,
  sort,
  onSortChange,
  rowTone,
  mobileCard,
  empty,
  minWidth,
  className = "",
}: {
  rows: T[];
  columns: DataColumn<T>[];
  getRowId: (row: T) => string;
  /** Accessible name of the table (and of the card list). */
  label: string;
  selection?: DataTableSelection<T>;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  /** Marks a row, e.g. "gap" for an uncovered requirement (red). */
  rowTone?: (row: T) => "gap" | undefined;
  /** The mobile view of a row; without it the table scrolls sideways. */
  mobileCard?: (row: T) => ReactNode;
  /** Shown instead of the rows when there are none. */
  empty?: ReactNode;
  /** Below this width (px) the table scrolls sideways. */
  minWidth?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const view = useBreakpoint();
  const visible = columns.filter((c) => !c.minView || RANK[view] >= RANK[c.minView]);
  const ids = rows.map(getRowId);
  const chosen = selection ? ids.filter((id) => selection.selected.has(id)).length : 0;
  const all = rows.length > 0 && chosen === rows.length;

  const toggleRow = (id: string) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  };
  const toggleAll = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
    selection.onChange(next);
  };
  const rowCheckbox = (row: T, id: string) =>
    selection && (
      <input
        type="checkbox"
        className="dt__check"
        checked={selection.selected.has(id)}
        onChange={() => toggleRow(id)}
        aria-label={t("table.selectRow", { name: selection.rowLabel(row) })}
      />
    );

  if (rows.length === 0 && empty) return <div className={`dt-empty ${className}`.trim()}>{empty}</div>;

  if (view === "mobile" && mobileCard) {
    return (
      <ul className={`dt-cards ${className}`.trim()} aria-label={label}>
        {rows.map((row) => {
          const id = getRowId(row);
          return (
            <li key={id} className="dt-card" data-tone={rowTone?.(row)}>
              {rowCheckbox(row, id)}
              <div className="dt-card__body">{mobileCard(row)}</div>
            </li>
          );
        })}
      </ul>
    );
  }

  const tracks = [selection ? "36px" : null, ...visible.map((c) => c.width ?? "minmax(0,1fr)")]
    .filter(Boolean)
    .join(" ");
  const style = { "--dt-cols": tracks, "--dt-min": minWidth ? `${minWidth}px` : undefined } as CSSProperties;

  return (
    <div className={`dt-wrap ${className}`.trim()}>
      <table className="dt" style={style} aria-label={label}>
        <thead>
          <tr className="dt__row dt__row--head">
            {selection && (
              <th scope="col" className="dt__cell dt__cell--check">
                <HeaderCheckbox
                  checked={all}
                  indeterminate={chosen > 0 && !all}
                  disabled={rows.length === 0}
                  onChange={toggleAll}
                  label={t("table.selectAll")}
                />
              </th>
            )}
            {visible.map((c) => {
              const active = sort?.id === c.id;
              return (
                <th
                  key={c.id}
                  scope="col"
                  className="dt__cell"
                  data-align={c.align}
                  aria-sort={c.sortable ? (active ? (sort.dir === "asc" ? "ascending" : "descending") : "none") : undefined}
                >
                  {c.sortable && onSortChange ? (
                    <button
                      type="button"
                      className="dt__sort"
                      data-active={active || undefined}
                      onClick={() =>
                        onSortChange({ id: c.id, dir: active && sort.dir === "asc" ? "desc" : "asc" })
                      }
                    >
                      {c.header}
                      {active ? (
                        sort.dir === "asc" ? (
                          <ArrowUp size={13} aria-hidden="true" />
                        ) : (
                          <ArrowDown size={13} aria-hidden="true" />
                        )
                      ) : (
                        <ArrowUpDown size={13} aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = getRowId(row);
            return (
              <tr
                key={id}
                className="dt__row"
                data-tone={rowTone?.(row)}
                data-selected={selection?.selected.has(id) || undefined}
              >
                {selection && <td className="dt__cell dt__cell--check">{rowCheckbox(row, id)}</td>}
                {visible.map((c) => (
                  <td key={c.id} className="dt__cell" data-align={c.align}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HeaderCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="dt__check"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={label}
    />
  );
}
