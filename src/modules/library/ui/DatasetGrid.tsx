import { useId, type ClipboardEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import {
  parseClipboardTable,
  pasteAt,
  tableFromMatrix,
  type DatasetTable,
} from "../model/table";
import { LIMITS } from "../model/types";

/** Moves the focus to the cell input at (`r`, `c`) of the grid, if any;
 *  `r` = -1 is the header row. */
function focusCell(root: HTMLElement | null, r: number, c: number) {
  root
    ?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`)
    ?.focus();
}

/** A dataset's editable grid (boceto 5). Keyboard: arrows move between cells
 *  (left and right at the edge of the text), Enter goes down. Pasting a
 *  block copied from a spreadsheet fills from the focused cell, adding rows
 *  and columns; into an empty dataset its first row becomes the header. */
export function DatasetGrid({
  value,
  onChange,
  label,
}: {
  value: DatasetTable;
  onChange: (next: DatasetTable) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const { columns, rows } = value;
  const emptyName = t("library.dataset.columnPrefix");
  const rowName = (i: number) => t("a11y.row", { n: i + 1 });
  const colName = (i: number) =>
    columns[i]?.name.trim() || t("library.dataset.columnN", { n: i + 1 });

  const setName = (i: number, name: string) =>
    onChange({
      columns: columns.map((c, j) => (j === i ? { ...c, name } : c)),
      rows,
    });
  const setCell = (r: number, colId: string, v: string) =>
    onChange({
      columns,
      rows: rows.map((row, i) =>
        i === r ? { ...row, values: { ...row.values, [colId]: v } } : row,
      ),
    });

  const onKey = (e: KeyboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLInputElement;
    if (el.tagName !== "INPUT" || el.dataset.r === undefined) return;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    const root = e.currentTarget;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length;
    let to: [number, number] | null = null;
    if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey))
      to = [Math.min(r + 1, rows.length - 1), c];
    else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey))
      to = [Math.max(r - 1, -1), c];
    else if (e.key === "ArrowLeft" && atStart) to = [r, Math.max(c - 1, 0)];
    else if (e.key === "ArrowRight" && atEnd)
      to = [r, Math.min(c + 1, columns.length - 1)];
    if (!to) return;
    e.preventDefault();
    focusCell(root, to[0], to[1]);
  };

  const onPaste = (e: ClipboardEvent<HTMLElement>) => {
    const block = parseClipboardTable(e.clipboardData.getData("text/plain"));
    if (!block) return;
    e.preventDefault();
    const el = e.target as HTMLElement;
    const empty = rows.length === 0 && columns.every((c) => !c.name.trim());
    if (empty) {
      onChange(tableFromMatrix(block, undefined, emptyName));
      return;
    }
    const r = Number(el.dataset?.r ?? 0);
    const c = Number(el.dataset?.c ?? 0);
    onChange(pasteAt(value, block, r, Math.max(c, 0), emptyName));
  };

  return (
    <div className="lb-grid-wrap" onPaste={onPaste}>
      {columns.length === 0 ? (
        <div className="lb-grid-empty">
          <label className="lb-field">
            <span>{t("library.dataset.pasteHere")}</span>
            <textarea
              rows={3}
              placeholder={t("library.dataset.pastePlaceholder")}
              value=""
              onChange={() => undefined}
            />
          </label>
        </div>
      ) : (
        <div className="lb-scroll">
          <table className="lb-grid" aria-label={label} onKeyDown={onKey}>
            <thead>
              <tr>
                <th scope="col" className="lb-grid__rid">
                  #
                </th>
                {columns.map((col, ci) => (
                  <th key={col.id} scope="col">
                    <div className="lb-grid__head">
                      <input
                        aria-label={t("library.dataset.columnName", {
                          n: ci + 1,
                        })}
                        data-r={-1}
                        data-c={ci}
                        value={col.name}
                        maxLength={LIMITS.paramName}
                        onChange={(e) => setName(ci, e.target.value)}
                      />
                      <button
                        type="button"
                        className="lb-grid__del"
                        aria-label={`${t("library.dataset.deleteColumn")}: ${colName(ci)}`}
                        title={t("library.dataset.deleteColumn")}
                        onClick={() =>
                          onChange({
                            columns: columns.filter((_, j) => j !== ci),
                            rows: rows.map((r) => {
                              const values = { ...r.values };
                              delete values[col.id];
                              return { ...r, values };
                            }),
                          })
                        }
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </th>
                ))}
                <th scope="col" className="lb-grid__rid">
                  <span className="sr-only">
                    {t("library.dataset.rowActions")}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row.id}>
                  <th scope="row" className="lb-grid__rid">
                    {ri + 1}
                  </th>
                  {columns.map((col, ci) => {
                    const v = row.values[col.id] ?? "";
                    const long = v.length > LIMITS.cell;
                    return (
                      <td key={col.id} data-invalid={long || undefined}>
                        <input
                          id={`${baseId}-${ri}-${ci}`}
                          aria-label={`${colName(ci)} · ${rowName(ri)}`}
                          aria-invalid={long || undefined}
                          data-r={ri}
                          data-c={ci}
                          value={v}
                          onChange={(e) => setCell(ri, col.id, e.target.value)}
                        />
                      </td>
                    );
                  })}
                  <td className="lb-grid__rid">
                    <button
                      type="button"
                      className="lb-grid__del"
                      aria-label={`${t("library.dataset.deleteRow")}: ${rowName(ri)}`}
                      title={t("library.dataset.deleteRow")}
                      onClick={() =>
                        onChange({
                          columns,
                          rows: rows.filter((_, j) => j !== ri),
                        })
                      }
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
