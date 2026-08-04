import type ExcelJS from "exceljs";

// Shared building blocks for header-driven .xlsx importers (plan, cases). The
// idea: detect known section headers (es/en) anywhere in the sheet and read the
// value relative to them, so imports tolerate row shifts and similar external
// templates.

export type FieldStatus = "filled" | "empty" | "notFound";

export interface DetectionRow {
  /** i18n key for the field label shown in the report. */
  labelKey: string;
  status: FieldStatus;
  /** Short human preview of the detected value (text/list fields). */
  preview?: string;
  /** Row count (table fields). */
  count?: number;
}

export interface ImportProgress {
  done: number;
  total: number;
  row: DetectionRow;
}

// --- text helpers ------------------------------------------------------------

export const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Normalized text with any leading section numbering ("13. ", "2) ") removed. */
export const headerKey = (s: string): string => norm(s).replace(/^\d+[.)]\s*/, "");

export const splitLines = (v: string): string[] =>
  v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

export const splitItems = (v: string): string[] =>
  v.split(/\r?\n|[,;]/).map((s) => s.trim()).filter(Boolean);

export const preview = (s: string, n = 48): string =>
  s.length > n ? `${s.slice(0, n).trim()}…` : s;

/** Builds a normalized-label → key map from one or more i18n label dictionaries. */
export function reverse(...maps: Record<string, string>[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const map of maps) {
    for (const [key, label] of Object.entries(map)) {
      out.set(norm(label), key);
      out.set(norm(key), key);
    }
  }
  return out;
}

/** Maps a displayed item back to a catalog key; unknown values are kept as-is
 *  (editors accept custom "Other" values). */
export function toKey(item: string, rev: Map<string, string>): string {
  return rev.get(norm(item)) ?? item.trim();
}

// --- cell access -------------------------------------------------------------

export interface Cell {
  r: number;
  c: number;
  text: string;
}

export function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return String(o.text ?? "");
    if ("result" in o) return String(o.result ?? "");
  }
  return "";
}

/** Flattens the sheet's non-empty cells (cols A..H) for header scanning. */
export function indexCells(ws: ExcelJS.Worksheet): Cell[] {
  const cells: Cell[] = [];
  for (let r = 1; r <= ws.rowCount; r += 1) {
    for (let c = 1; c <= 8; c += 1) {
      const text = cellText(ws.getCell(r, c)).trim();
      if (text) cells.push({ r, c, text });
    }
  }
  return cells;
}

export function findLabel(cells: Cell[], aliases: string[]): Cell | null {
  const set = new Set(aliases);
  for (const cell of cells) if (set.has(headerKey(cell.text))) return cell;
  return null;
}

/** Reads the value for a "below"/"right" field relative to its label cell. */
export function readValue(ws: ExcelJS.Worksheet, label: Cell, dir: "right" | "below"): string {
  if (dir === "below") return cellText(ws.getCell(label.r + 1, label.c)).trim();
  for (let c = label.c + 1; c <= label.c + 6; c += 1) {
    const text = cellText(ws.getCell(label.r, c)).trim();
    if (text) return text;
  }
  return "";
}

export interface TableHit {
  headerRow: number;
  leftCol: number;
  rightCol: number;
}

/** Finds a two-column table header row matching the left/right alias sets. */
export function findTableHeader(cells: Cell[], left: string[], right: string[]): TableHit | null {
  const L = new Set(left);
  const R = new Set(right);
  const byRow = new Map<number, Cell[]>();
  for (const cell of cells) {
    const arr = byRow.get(cell.r) ?? [];
    arr.push(cell);
    byRow.set(cell.r, arr);
  }
  for (const [r, rowCells] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const l = rowCells.find((c) => L.has(headerKey(c.text)));
    const rr = rowCells.find((c) => R.has(headerKey(c.text)));
    if (l && rr && l.c !== rr.c) return { headerRow: r, leftCol: l.c, rightCol: rr.c };
  }
  return null;
}

/** Reads two-column table rows below the header until an empty row or a section
 *  boundary (a numbered heading, or a cell matching one of `stopTokens`). The
 *  templates pack sections back-to-back, so an empty row is not guaranteed. */
export function readTable(
  ws: ExcelJS.Worksheet,
  hit: TableHit,
  stopTokens: Set<string>,
): { left: string; right: string }[] {
  const boundary = (text: string) =>
    !!text && (stopTokens.has(headerKey(text)) || /^\d+[.)]\s/.test(norm(text)));
  const out: { left: string; right: string }[] = [];
  for (let r = hit.headerRow + 1; r <= ws.rowCount + 1; r += 1) {
    const left = cellText(ws.getCell(r, hit.leftCol)).trim();
    const right = cellText(ws.getCell(r, hit.rightCol)).trim();
    if (!left && !right) break;
    if (boundary(left) || boundary(right)) break;
    out.push({ left, right });
  }
  return out;
}
