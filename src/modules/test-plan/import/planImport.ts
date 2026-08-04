import ExcelJS from "exceljs";
import esLocale from "@shared/i18n/locales/es.json";
import enLocale from "@shared/i18n/locales/en.json";
import { CEREMONIES } from "../model/catalogs";
import type {
  ClosureCriterion,
  RiskItem,
  RoleItem,
  ScheduleSprint,
  TestPlanData,
  TestPlanInput,
} from "../model/types";

// --- Header-driven .xlsx plan importer ---------------------------------------
// Reads a plan spreadsheet by DETECTING section headers (es/en), not by fixed
// cell coordinates, so it works on Pharos exports and on similar external files.
// It never persists: it returns a TestPlanInput plus a per-field detection report
// (what was filled, left blank, or not found) for review in the wizard.

export type FieldStatus = "filled" | "empty" | "notFound";

export interface DetectionRow {
  /** i18n key for the field label shown in the report. */
  labelKey: string;
  status: FieldStatus;
  /** Short human preview of the detected value (for text/list fields). */
  preview?: string;
  /** Row count (for table fields). */
  count?: number;
}

export interface ImportResult {
  input: TestPlanInput;
  rows: DetectionRow[];
}

export interface ImportProgress {
  done: number;
  total: number;
  row: DetectionRow;
}

// --- text helpers ------------------------------------------------------------

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Normalized text with any leading section numbering ("13. ", "2) ") removed. */
const headerKey = (s: string): string => norm(s).replace(/^\d+[.)]\s*/, "");

const splitLines = (v: string): string[] =>
  v
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

const splitItems = (v: string): string[] =>
  v
    .split(/\r?\n|[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

const preview = (s: string, n = 48): string =>
  s.length > n ? `${s.slice(0, n).trim()}…` : s;

/** Builds a normalized-label → key map from an i18n label dictionary. */
function reverse(...maps: Record<string, string>[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const map of maps) {
    for (const [key, label] of Object.entries(map)) {
      out.set(norm(label), key);
      out.set(norm(key), key);
    }
  }
  return out;
}

const tp = (loc: typeof esLocale) => loc.testPlan as unknown as Record<string, Record<string, string>>;
const TYPE_REV = reverse(tp(esLocale).typeLabel, tp(enLocale).typeLabel);
const LEVEL_REV = reverse(tp(esLocale).levelLabel, tp(enLocale).levelLabel);
const TOOL_REV = reverse(tp(esLocale).toolLabel, tp(enLocale).toolLabel);
const STATUS_REV = reverse(tp(esLocale).statusLabel, tp(enLocale).statusLabel);

/** Maps a displayed item back to a catalog key; unknown values are kept as-is
 *  (the wizard accepts custom "Other" values). */
function toKey(item: string, rev: Map<string, string>): string {
  return rev.get(norm(item)) ?? item.trim();
}

// --- cell access -------------------------------------------------------------

interface Cell {
  r: number;
  c: number;
  text: string;
}

function cellText(cell: ExcelJS.Cell): string {
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
function indexCells(ws: ExcelJS.Worksheet): Cell[] {
  const cells: Cell[] = [];
  const maxRow = ws.rowCount;
  for (let r = 1; r <= maxRow; r += 1) {
    for (let c = 1; c <= 8; c += 1) {
      const text = cellText(ws.getCell(r, c)).trim();
      if (text) cells.push({ r, c, text });
    }
  }
  return cells;
}

// --- field specs -------------------------------------------------------------

type Kind = "text" | "listFree" | "catalog" | "status" | "methodology";

interface FieldSpec {
  id: string;
  labelKey: string;
  aliases: string[]; // normalized header keys (es + en)
  dir: "right" | "below";
  kind: Kind;
  rev?: Map<string, string>;
}

const FIELDS: FieldSpec[] = [
  { id: "version", labelKey: "testPlan.version", aliases: ["version"], dir: "right", kind: "text" },
  { id: "planDate", labelKey: "testPlan.date", aliases: ["fecha", "date"], dir: "right", kind: "text" },
  { id: "author", labelKey: "testPlan.author", aliases: ["elaborado por (nombre y apellidos)", "author (first and last name)", "elaborado por", "author"], dir: "right", kind: "text" },
  { id: "status", labelKey: "testPlan.status", aliases: ["estado", "status"], dir: "right", kind: "status", rev: STATUS_REV },
  { id: "summary", labelKey: "testPlan.summary", aliases: ["resumen", "summary"], dir: "below", kind: "text" },
  { id: "purpose", labelKey: "testPlan.purpose", aliases: ["proposito", "purpose"], dir: "below", kind: "text" },
  { id: "scopeIn", labelKey: "testPlan.scopeIn", aliases: ["elementos dentro del alcance", "in-scope items"], dir: "below", kind: "listFree" },
  { id: "scopeOut", labelKey: "testPlan.scopeOut", aliases: ["fuera del alcance", "out of scope"], dir: "below", kind: "listFree" },
  { id: "testTypes", labelKey: "testPlan.step.types", aliases: ["tipos de prueba", "test types"], dir: "below", kind: "catalog", rev: TYPE_REV },
  { id: "methodology", labelKey: "testPlan.methodology", aliases: ["metodologia agil (sprints, ceremonias, retrospectiva)", "agile methodology (sprints, ceremonies, retrospective)", "metodologia", "methodology"], dir: "below", kind: "methodology" },
  { id: "testLevels", labelKey: "testPlan.step.levels", aliases: ["niveles de prueba", "test levels"], dir: "below", kind: "catalog", rev: LEVEL_REV },
  { id: "deliverables", labelKey: "testPlan.step.deliverables", aliases: ["entregables de prueba", "test deliverables"], dir: "below", kind: "listFree" },
  { id: "environmentConfig", labelKey: "testPlan.environmentConfig", aliases: ["configuracion", "configuration"], dir: "below", kind: "text" },
  { id: "environmentRequirements", labelKey: "testPlan.environmentRequirements", aliases: ["requisitos de hardware y software", "hardware and software requirements"], dir: "below", kind: "text" },
  { id: "tools", labelKey: "testPlan.tools", aliases: ["herramientas de prueba", "test tools"], dir: "below", kind: "catalog", rev: TOOL_REV },
  { id: "automationStrategy", labelKey: "testPlan.automationStrategy", aliases: ["estrategia de automatizacion", "automation strategy"], dir: "below", kind: "text" },
  { id: "testDataManagement", labelKey: "testPlan.testDataManagement", aliases: ["enfoque de datos", "data approach"], dir: "below", kind: "text" },
  { id: "defectManagement", labelKey: "testPlan.defectManagement", aliases: ["proceso de reporte", "reporting process"], dir: "below", kind: "text" },
  { id: "communicationPlan", labelKey: "testPlan.communicationPlan", aliases: ["canales", "channels"], dir: "below", kind: "text" },
  { id: "conclusion", labelKey: "testPlan.conclusion", aliases: ["conclusion"], dir: "below", kind: "text" },
];

interface TableSpec {
  id: string;
  labelKey: string;
  left: string[];
  right: string[];
}

const TABLES: TableSpec[] = [
  { id: "roles", labelKey: "testPlan.step.roles", left: ["rol", "role"], right: ["responsabilidades", "responsibilities", "responsabilidad", "responsibility"] },
  { id: "sprints", labelKey: "testPlan.step.schedule", left: ["actividad", "activity"], right: ["fecha", "date"] },
  { id: "risks", labelKey: "testPlan.step.risks", left: ["riesgo potencial", "potential risk", "riesgo", "risk"], right: ["estrategia de mitigacion", "mitigation strategy", "mitigacion", "mitigation"] },
  { id: "closure", labelKey: "testPlan.step.closure", left: ["criterio", "criterion"], right: ["metrica de exito", "success metric", "metrica", "metric"] },
];

// --- detection ---------------------------------------------------------------

function findLabel(cells: Cell[], aliases: string[]): Cell | null {
  const set = new Set(aliases);
  for (const cell of cells) if (set.has(headerKey(cell.text))) return cell;
  return null;
}

/** Reads the value for a "below"/"right" field relative to its label cell. */
function readValue(ws: ExcelJS.Worksheet, label: Cell, dir: "right" | "below"): string {
  if (dir === "below") return cellText(ws.getCell(label.r + 1, label.c)).trim();
  for (let c = label.c + 1; c <= label.c + 6; c += 1) {
    const text = cellText(ws.getCell(label.r, c)).trim();
    if (text) return text;
  }
  return "";
}

interface TableHit {
  headerRow: number;
  leftCol: number;
  rightCol: number;
}

function findTableHeader(cells: Cell[], spec: TableSpec): TableHit | null {
  const left = new Set(spec.left);
  const right = new Set(spec.right);
  const byRow = new Map<number, Cell[]>();
  for (const cell of cells) {
    const arr = byRow.get(cell.r) ?? [];
    arr.push(cell);
    byRow.set(cell.r, arr);
  }
  for (const [r, rowCells] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const l = rowCells.find((c) => left.has(headerKey(c.text)));
    const rr = rowCells.find((c) => right.has(headerKey(c.text)));
    if (l && rr && l.c !== rr.c) return { headerRow: r, leftCol: l.c, rightCol: rr.c };
  }
  return null;
}

// Every known header token; a table stops when a data row hits one of these
// (the templates pack sections back-to-back, with no blank row between them).
const STOP_TOKENS = new Set<string>([
  ...FIELDS.flatMap((f) => f.aliases),
  ...TABLES.flatMap((t) => [...t.left, ...t.right]),
]);

const isBoundary = (text: string): boolean =>
  !!text && (STOP_TOKENS.has(headerKey(text)) || /^\d+[.)]\s/.test(norm(text)));

/** Reads two-column table rows below the header until an empty row or the next
 *  section/table boundary (a numbered heading or a known header label). */
function readTable(ws: ExcelJS.Worksheet, hit: TableHit): { left: string; right: string }[] {
  const out: { left: string; right: string }[] = [];
  for (let r = hit.headerRow + 1; r <= ws.rowCount + 1; r += 1) {
    const left = cellText(ws.getCell(r, hit.leftCol)).trim();
    const right = cellText(ws.getCell(r, hit.rightCol)).trim();
    if (!left && !right) break;
    if (isBoundary(left) || isBoundary(right)) break;
    out.push({ left, right });
  }
  return out;
}

function parseMethodology(text: string): Pick<TestPlanData, "methodologyType" | "sprintWeeks" | "ceremonies" | "phases"> {
  const n = norm(text);
  const traditional = /(tradicional|traditional|v-?model)/.test(n);
  if (traditional) {
    const after = text.split(/fases:|phases:/i)[1] ?? "";
    const phases = splitItems(after);
    return { methodologyType: "traditional", phases };
  }
  const weeks = n.match(/(?:semanas?|weeks?)[^\d]*(\d+)/) ?? n.match(/(\d+)\s*(?:semanas?|weeks?)/);
  const ceremonies = CEREMONIES.filter((k) => {
    const es = norm(tp(esLocale).ceremonyLabel[k] ?? "");
    const en = norm(tp(enLocale).ceremonyLabel[k] ?? "");
    return (es && n.includes(es)) || (en && n.includes(en));
  });
  return {
    methodologyType: "agile",
    sprintWeeks: weeks ? Number(weeks[1]) : undefined,
    ceremonies,
  };
}

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 24));

/**
 * Parses a plan .xlsx into a TestPlanInput plus a detection report. The title is
 * taken from the file name (Pharos does not write it into a cell). `onProgress`
 * fires per field so a modal can show detection live.
 */
export async function parsePlanXlsx(
  buffer: ArrayBuffer,
  fileName: string,
  author: string,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const cells = indexCells(ws);

  const data: TestPlanData = {};
  const rows: DetectionRow[] = [];
  const total = FIELDS.length + TABLES.length + 1; // +1 for the title
  let done = 0;

  const push = (row: DetectionRow) => {
    rows.push(row);
    done += 1;
    onProgress?.({ done, total, row });
  };

  // Title comes from the file name.
  const title = fileName.replace(/\.xlsx$/i, "").trim();
  const titleRow: DetectionRow = {
    labelKey: "testPlan.fieldTitle",
    status: title ? "filled" : "empty",
    preview: title || undefined,
  };
  push(titleRow);
  await yieldFrame();

  let version = "";
  let planDate = "";
  let status = "";

  for (const spec of FIELDS) {
    const label = findLabel(cells, spec.aliases);
    if (!label) {
      push({ labelKey: spec.labelKey, status: "notFound" });
      await yieldFrame();
      continue;
    }
    const raw = readValue(ws, label, spec.dir);
    let filled = raw.trim().length > 0;
    let prev: string | undefined = raw ? preview(raw.replace(/\n/g, " · ")) : undefined;

    switch (spec.kind) {
      case "text":
        if (spec.id === "version") version = raw;
        else if (spec.id === "planDate") planDate = raw;
        else if (spec.id === "author") { if (raw) author = raw; }
        else (data as Record<string, unknown>)[spec.id] = raw;
        break;
      case "listFree": {
        const list = splitLines(raw);
        (data as Record<string, unknown>)[spec.id] = list;
        filled = list.length > 0;
        prev = list.length ? preview(list.join(", ")) : undefined;
        break;
      }
      case "catalog": {
        const list = splitItems(raw).map((it) => toKey(it, spec.rev!));
        (data as Record<string, unknown>)[spec.id] = list;
        filled = list.length > 0;
        prev = list.length ? preview(list.join(", ")) : undefined;
        break;
      }
      case "status":
        status = raw ? (spec.rev!.get(norm(raw)) ?? "") : "";
        prev = status || undefined;
        filled = status.length > 0;
        break;
      case "methodology": {
        const m = parseMethodology(raw);
        Object.assign(data, m);
        break;
      }
    }
    push({ labelKey: spec.labelKey, status: filled ? "filled" : "empty", preview: prev });
    await yieldFrame();
  }

  for (const spec of TABLES) {
    const hit = findTableHeader(cells, spec);
    if (!hit) {
      push({ labelKey: spec.labelKey, status: "notFound" });
      await yieldFrame();
      continue;
    }
    const raw = readTable(ws, hit).filter((p) => p.left || p.right);
    if (spec.id === "roles") {
      const items: RoleItem[] = raw.map((p) => ({ role: p.left, responsibility: p.right }));
      data.roles = items;
    } else if (spec.id === "sprints") {
      const items: ScheduleSprint[] = raw.map((p) => {
        const [start = "", end = ""] = p.right.split(/→|-{1,2}>|\bto\b/).map((s) => s.trim());
        return { name: p.left, start, end };
      });
      data.sprints = items;
    } else if (spec.id === "risks") {
      const items: RiskItem[] = raw.map((p) => ({ risk: p.left, mitigation: p.right }));
      data.risks = items;
    } else if (spec.id === "closure") {
      const items: ClosureCriterion[] = raw.map((p) => ({ criterion: p.left, metric: p.right }));
      data.closureCriteria = items;
    }
    push({ labelKey: spec.labelKey, status: raw.length ? "filled" : "empty", count: raw.length });
    await yieldFrame();
  }

  const input: TestPlanInput = {
    title,
    version: version || "1.0",
    planDate: planDate || null,
    author,
    status: status || "draft",
    data,
  };
  return { input, rows };
}
