// Dataset tables in and out of the grid (CAS-01, ADR-0055 §8): CSV import
// (UTF-8 with or without BOM, `;` or `,` detected, RFC 4180 quotes), pasting
// from a spreadsheet (TSV on the clipboard), CSV export, and the limits of §1
// checked before saving. Pure functions; the UI and the tests call them.

import { LIMITS, newId, type DatasetColumn, type DatasetRow } from "./types";

/** Drops a leading UTF-8 BOM. */
export const stripBom = (text: string) =>
  text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

/** `;` or `,`: the one that splits the first line (outside quotes) into more
 *  fields. Excel in Spanish writes `;`; a tie gives `,`. */
export function detectDelimiter(text: string): ";" | "," {
  const src = stripBom(text);
  let semis = 0;
  let commas = 0;
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch === ";") semis++;
    else if (!quoted && ch === ",") commas++;
  }
  return semis > commas ? ";" : ",";
}

/** Rows of delimited text with RFC 4180 quotes (`""` is a quote; a quoted
 *  field may hold the delimiter and line breaks). Blank lines are dropped. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const src = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let wasQuoted = false;
  const endCell = () => {
    row.push(wasQuoted ? cell : cell.trim());
    cell = "";
    wasQuoted = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      quoted = true;
      wasQuoted = true;
      cell = "";
    } else if (ch === delimiter) endCell();
    else if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
    } else if (ch === "\n") endRow();
    else cell += ch;
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

/** A CSV file's rows, with its delimiter detected. */
export const parseCsv = (text: string): string[][] =>
  parseDelimited(text, detectDelimiter(text));

/** What a spreadsheet puts on the clipboard: tab-separated rows. A single
 *  value with no tab and no line break is not a table (null). */
export function parseClipboardTable(text: string): string[][] | null {
  if (!/[\t\n\r]/.test(text)) return null;
  const rows = parseDelimited(text.replace(/(\r?\n)+$/, ""), "\t");
  return rows.length > 0 ? rows : null;
}

/** CSV with a BOM (so Excel reads the accents) and the given delimiter. */
export function toCsv(rows: string[][], delimiter: ";" | "," = ","): string {
  const cell = (v: string) =>
    v.includes(delimiter) || /["\n\r]/.test(v)
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  return (
    "﻿" + rows.map((r) => r.map(cell).join(delimiter)).join("\r\n") + "\r\n"
  );
}

export interface DatasetTable {
  columns: DatasetColumn[];
  rows: DatasetRow[];
}

/** A dataset from a matrix whose first row is the header. Columns keep the
 *  id of a column of `prev` with the same name, and rows the id of the row of
 *  `prev` in the same position, so re-importing an updated sheet keeps the
 *  ids the cases' results point at. Empty header cells get «columna N». */
export function tableFromMatrix(
  matrix: string[][],
  prev?: DatasetTable,
  emptyName = "columna",
): DatasetTable {
  const [head = [], ...body] = matrix;
  const width = Math.max(head.length, ...body.map((r) => r.length), 0);
  const usedCols = new Set<string>();
  const names: string[] = [];
  const columns: DatasetColumn[] = [];
  for (let i = 0; i < width; i++) {
    let name = (head[i] ?? "").trim() || `${emptyName} ${i + 1}`;
    let n = 2;
    const base = name;
    while (names.includes(name)) name = `${base} (${n++})`;
    names.push(name);
    const keep = prev?.columns.find(
      (c) => c.name === name && !usedCols.has(c.id),
    );
    const id = keep?.id ?? newId(usedCols);
    usedCols.add(id);
    columns.push({ id, name });
  }
  const usedRows = new Set<string>();
  const rows: DatasetRow[] = body.map((r, ri) => {
    const keep = prev?.rows[ri]?.id;
    const id = keep && !usedRows.has(keep) ? keep : newId(usedRows);
    usedRows.add(id);
    const values: Record<string, string> = {};
    columns.forEach((c, ci) => (values[c.id] = r[ci] ?? ""));
    return { id, values };
  });
  return { columns, rows };
}

/** The dataset as a matrix: header row, then the values. */
export const matrixOf = (t: DatasetTable): string[][] => [
  t.columns.map((c) => c.name),
  ...t.rows.map((r) => t.columns.map((c) => r.values[c.id] ?? "")),
];

/** Pastes `block` into the grid with its top-left cell at (`row`, `col`),
 *  adding rows and columns as needed. New columns are named «columna N». */
export function pasteBlock(
  t: DatasetTable,
  block: string[][],
  row: number,
  col: number,
  emptyName = "columna",
): DatasetTable {
  const width = Math.max(...block.map((r) => r.length), 0);
  const { columns } = withColumns(t, col + width, emptyName);
  const rows = t.rows.map((r) => ({ ...r, values: { ...r.values } }));
  const usedRows = new Set(rows.map((r) => r.id));
  while (rows.length < row + block.length)
    rows.push({ id: newId(usedRows), values: {} });
  block.forEach((cells, i) => {
    cells.forEach((v, j) => {
      rows[row + i].values[columns[col + j].id] = v;
    });
  });
  return { columns, rows };
}

/** The table with at least `width` columns (new ones named «columna N»). */
function withColumns(
  t: DatasetTable,
  width: number,
  emptyName: string,
): DatasetTable {
  const columns = [...t.columns];
  const used = new Set(columns.map((c) => c.id));
  while (columns.length < width) {
    let name = `${emptyName} ${columns.length + 1}`;
    let n = 2;
    while (columns.some((c) => c.name === name))
      name = `${emptyName} ${columns.length + 1} (${n++})`;
    columns.push({ id: newId(used), name });
  }
  return { columns, rows: t.rows };
}

/** A paste at a cell (`row` ≥ 0) or on the header (`row` = -1: the block's
 *  first line renames the columns from `col`, the rest fills from row 1). */
export function pasteAt(
  t: DatasetTable,
  block: string[][],
  row: number,
  col: number,
  emptyName = "columna",
): DatasetTable {
  if (row >= 0) return pasteBlock(t, block, row, col, emptyName);
  const [head = [], ...body] = block;
  const width = Math.max(head.length, ...body.map((r) => r.length), 0);
  const grown = withColumns(t, col + width, emptyName);
  const named = {
    columns: grown.columns.map((c, j) =>
      j >= col && j - col < head.length ? { ...c, name: head[j - col] } : c,
    ),
    rows: grown.rows,
  };
  return body.length ? pasteBlock(named, body, 0, col, emptyName) : named;
}

/** Problems that stop a dataset from being saved (ADR-0055 §1). */
export type TableIssue =
  | { kind: "noColumns" }
  | { kind: "tooManyColumns"; max: number }
  | { kind: "tooManyRows"; max: number }
  | { kind: "emptyColumn"; column: number }
  | { kind: "badColumn"; name: string }
  | { kind: "duplicateColumn"; name: string }
  | { kind: "cellTooLong"; row: number; column: string };

/** The name rule of a parameter or column (`valid_name` in the core). */
export const validName = (name: string) =>
  name.trim() === name &&
  name.length > 0 &&
  name.length <= LIMITS.paramName &&
  !/[<>\n\r\t]/.test(name);

export function tableIssues(t: DatasetTable): TableIssue[] {
  const out: TableIssue[] = [];
  if (t.columns.length === 0) out.push({ kind: "noColumns" });
  if (t.columns.length > LIMITS.columns)
    out.push({ kind: "tooManyColumns", max: LIMITS.columns });
  if (t.rows.length > LIMITS.rows)
    out.push({ kind: "tooManyRows", max: LIMITS.rows });
  const seen = new Set<string>();
  t.columns.forEach((c, i) => {
    const name = c.name.trim();
    if (!name) out.push({ kind: "emptyColumn", column: i + 1 });
    else if (!validName(name)) out.push({ kind: "badColumn", name });
    else if (seen.has(name)) out.push({ kind: "duplicateColumn", name });
    seen.add(name);
  });
  t.rows.forEach((r, ri) => {
    for (const c of t.columns) {
      if ((r.values[c.id] ?? "").length > LIMITS.cell)
        out.push({ kind: "cellTooLong", row: ri + 1, column: c.name });
    }
  });
  return out;
}

/** The table with one more empty row. */
export const addRow = (t: DatasetTable): DatasetTable => ({
  columns: t.columns,
  rows: [
    ...t.rows,
    { id: newId(new Set(t.rows.map((r) => r.id))), values: {} },
  ],
});

/** The table with one more column, named «<prefix> N». */
export const addColumn = (t: DatasetTable, prefix = "columna"): DatasetTable =>
  withColumns(t, t.columns.length + 1, prefix);
