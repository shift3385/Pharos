// CSV import of requirements (TRZ-01). Pure functions: parse the text (RFC 4180
// quoting, `,` or `;` delimiter auto-detected — Excel in Spanish locales writes
// `;`), detect the columns by header (es/en) and map rows to import rows plus a
// report of what was skipped and why. Nothing is persisted here.

import {
  isValidRequirementKey,
  type RequirementImportRow,
  type RequirementPriority,
} from "../model/types";

export type CsvColumn = "requirementKey" | "title" | "description" | "priority";

export interface CsvIssue {
  /** 1-based line of the row in the file (header = 1). */
  line: number;
  reason: "noTitle" | "invalidKey" | "duplicateKey";
  value?: string;
}

export interface CsvImportResult {
  rows: RequirementImportRow[];
  columns: Partial<Record<CsvColumn, string>>;
  issues: CsvIssue[];
}

/** Lower-cases and strips accents/punctuation so headers compare loosely. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Header aliases per column, already normalized. Order matters inside a list
// only for readability; the first header that matches wins.
const ALIASES: Record<CsvColumn, string[]> = {
  requirementKey: [
    "id",
    "key",
    "clave",
    "id requisito",
    "id de requisito",
    "requirement id",
    "req id",
    "requirement key",
    "issue key",
    "codigo",
    "code",
  ],
  title: ["titulo", "title", "requisito", "requirement", "nombre", "name", "summary", "resumen"],
  description: [
    "descripcion",
    "description",
    "descripcion del requisito",
    "requirement description",
    "detalle",
    "details",
  ],
  priority: ["prioridad", "priority"],
};

const PRIORITY_WORDS: Record<string, RequirementPriority> = {
  alta: "high",
  high: "high",
  critica: "high",
  critical: "high",
  highest: "high",
  media: "medium",
  medium: "medium",
  normal: "medium",
  baja: "low",
  low: "low",
  lowest: "low",
  minor: "low",
};

/** Maps a free-text priority ("Alta", "High", "critical"…) to the 3-level scale. */
export function parsePriority(value: string): RequirementPriority | undefined {
  return PRIORITY_WORDS[norm(value)];
}

/** Picks the delimiter that splits the header line into the most fields. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (d: string) => firstLine.split(d).length;
  return count(";") > count(",") ? ";" : ",";
}

interface CsvRow {
  cells: string[];
  /** 1-based line where the row starts (kept so reports point at the file). */
  line: number;
}

/** Parses CSV text into rows of cells (handles quotes, escaped quotes and
 *  newlines inside quoted cells). Fully blank lines are dropped. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  return parseCsvRows(text, delimiter).map((r) => r.cells);
}

function parseCsvRows(text: string, delimiter = detectDelimiter(text)): CsvRow[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip a UTF-8 BOM
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let line = 1;
  let rowLine = 1;
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push({ cells: row, line: rowLine });
      row = [];
      cell = "";
      rowLine = ++line;
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push({ cells: row, line: rowLine });
  }
  return rows.filter((r) => r.cells.some((c) => c.trim()));
}

/** Finds which header index feeds each column. When the file has no title
 *  column but has a description, the description becomes the title (the
 *  traceability template calls the requirement statement its "description"). */
function detectColumns(header: string[]): Partial<Record<CsvColumn, number>> {
  const normalized = header.map(norm);
  const found: Partial<Record<CsvColumn, number>> = {};
  for (const col of Object.keys(ALIASES) as CsvColumn[]) {
    const idx = normalized.findIndex(
      (h, i) => ALIASES[col].includes(h) && !Object.values(found).includes(i),
    );
    if (idx >= 0) found[col] = idx;
  }
  if (found.title === undefined && found.description !== undefined) {
    found.title = found.description;
    delete found.description;
  }
  return found;
}

/** Parses a requirements CSV into import rows + a per-row report. */
export function parseRequirementCsv(text: string): CsvImportResult {
  const table = parseCsvRows(text);
  const header = table[0]?.cells ?? [];
  const idx = detectColumns(header);
  const columns: Partial<Record<CsvColumn, string>> = {};
  for (const [col, i] of Object.entries(idx) as [CsvColumn, number][]) columns[col] = header[i].trim();

  const rows: RequirementImportRow[] = [];
  const issues: CsvIssue[] = [];
  const seen = new Set<string>();
  const at = (cells: string[], col: CsvColumn) =>
    idx[col] === undefined ? "" : (cells[idx[col] as number] ?? "").trim();

  table.slice(1).forEach(({ cells, line }) => {
    const title = at(cells, "title");
    const key = at(cells, "requirementKey");
    if (!title) {
      issues.push({ line, reason: "noTitle" });
      return;
    }
    if (key && !isValidRequirementKey(key)) {
      issues.push({ line, reason: "invalidKey", value: key });
      return;
    }
    if (key && seen.has(key)) {
      issues.push({ line, reason: "duplicateKey", value: key });
      return;
    }
    if (key) seen.add(key);
    rows.push({
      requirementKey: key || undefined,
      title,
      description: at(cells, "description") || undefined,
      priority: parsePriority(at(cells, "priority")),
    });
  });

  return { rows, columns, issues };
}
