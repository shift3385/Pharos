import ExcelJS from "exceljs";
import esLocale from "@shared/i18n/locales/es.json";
import enLocale from "@shared/i18n/locales/en.json";
import {
  findLabel,
  findTableHeader,
  indexCells,
  norm,
  preview,
  readTable,
  readValue,
  reverse,
  splitItems,
  splitLines,
  toKey,
  type DetectionRow,
} from "@shared/import/xlsx";
import { CEREMONIES, CEREMONY_FREQUENCIES } from "../model/catalogs";
import { DELIVERABLE_REV, TOOL_REV } from "../model/catalogLabels";
import { fromDisplay } from "../model/schedule";
import type {
  ClosureCriterion,
  RiskItem,
  RoleItem,
  StoredSprint,
  TestPlanData,
  TestPlanInput,
} from "../model/types";

// --- Header-driven .xlsx plan importer ---------------------------------------
// Reads a plan spreadsheet by DETECTING section headers (es/en), not by fixed
// cell coordinates, so it works on Pharos exports and on similar external files.
// It never persists: it returns a TestPlanInput plus a per-field detection report
// (what was filled, left blank, or not found) for review in the wizard.

export type { DetectionRow, ImportProgress } from "@shared/import/xlsx";

export interface ImportResult {
  /** The parsed plan; the caller adds the signed-in `userId` when saving. */
  input: Omit<TestPlanInput, "userId">;
  rows: DetectionRow[];
}

const tp = (loc: typeof esLocale) => loc.testPlan as unknown as Record<string, Record<string, string>>;
const TYPE_REV = reverse(tp(esLocale).typeLabel, tp(enLocale).typeLabel);
const LEVEL_REV = reverse(tp(esLocale).levelLabel, tp(enLocale).levelLabel);
const STATUS_REV = reverse(tp(esLocale).statusLabel, tp(enLocale).statusLabel);
const FREQUENCY_REV = reverse(tp(esLocale).frequencyLabel, tp(enLocale).frequencyLabel);

// "catalogLines": one item per line, mapped to catalog keys (deliverables:
// an own one may contain commas, so it is not split on them).
type Kind = "text" | "listFree" | "catalog" | "catalogLines" | "status" | "methodology";

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
  { id: "deliverables", labelKey: "testPlan.step.deliverables", aliases: ["entregables de prueba", "test deliverables"], dir: "below", kind: "catalogLines", rev: DELIVERABLE_REV },
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

// Every known header token; a table stops when a data row hits one of these.
const STOP_TOKENS = new Set<string>([
  ...FIELDS.flatMap((f) => f.aliases),
  ...TABLES.flatMap((t) => [...t.left, ...t.right]),
]);

function parseMethodology(
  text: string,
): Pick<
  TestPlanData,
  "methodologyType" | "sprintWeeks" | "ceremonies" | "ceremonyFrequency" | "phases"
> {
  const n = norm(text);
  if (/(tradicional|traditional|v-?model)/.test(n)) {
    const after = text.split(/fases:|phases:/i)[1] ?? "";
    return { methodologyType: "traditional", phases: splitItems(after) };
  }
  const weeks = n.match(/(?:semanas?|weeks?)[^\d]*(\d+)/) ?? n.match(/(\d+)\s*(?:semanas?|weeks?)/);
  const ceremonies: string[] = [];
  const ceremonyFrequency: Record<string, string> = {};
  for (const k of CEREMONIES) {
    const labels = [tp(esLocale).ceremonyLabel[k], tp(enLocale).ceremonyLabel[k]]
      .map((l) => norm(l ?? ""))
      .filter((l) => l && n.includes(l));
    if (!labels.length) continue;
    ceremonies.push(k);
    // Pharos exports write "<ceremony> (<frequency>)" (PLN-01).
    for (const label of labels) {
      const freq = n.slice(n.indexOf(label) + label.length).match(/^\s*\(([^)]*)\)/);
      const key = freq ? FREQUENCY_REV.get(norm(freq[1])) : undefined;
      if (key && CEREMONY_FREQUENCIES.includes(key)) ceremonyFrequency[k] = key;
    }
  }
  return {
    methodologyType: "agile",
    sprintWeeks: weeks ? Number(weeks[1]) : undefined,
    ceremonies,
    ...(Object.keys(ceremonyFrequency).length ? { ceremonyFrequency } : {}),
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
  onProgress?: (p: import("@shared/import/xlsx").ImportProgress) => void,
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

  const title = fileName.replace(/\.xlsx$/i, "").trim();
  push({ labelKey: "testPlan.fieldTitle", status: title ? "filled" : "empty", preview: title || undefined });
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
      case "catalog":
      case "catalogLines": {
        const items = spec.kind === "catalogLines" ? splitLines(raw) : splitItems(raw);
        const list = items.map((it) => toKey(it, spec.rev!));
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
      case "methodology":
        Object.assign(data, parseMethodology(raw));
        break;
    }
    push({ labelKey: spec.labelKey, status: filled ? "filled" : "empty", preview: prev });
    await yieldFrame();
  }

  for (const spec of TABLES) {
    const hit = findTableHeader(cells, spec.left, spec.right);
    if (!hit) {
      push({ labelKey: spec.labelKey, status: "notFound" });
      await yieldFrame();
      continue;
    }
    const raw = readTable(ws, hit, STOP_TOKENS).filter((p) => p.left || p.right);
    if (spec.id === "roles") data.roles = raw.map((p): RoleItem => ({ role: p.left, responsibility: p.right }));
    else if (spec.id === "sprints")
      data.sprints = raw.map((p): StoredSprint => {
        // A dd/mm/aaaa date becomes ISO; anything else is kept as written.
        const [start = "", end = ""] = p.right
          .split(/→|-{1,2}>|\bto\b/)
          .map((s) => s.trim())
          .map((s) => fromDisplay(s) ?? s);
        return { name: p.left, start, end };
      });
    else if (spec.id === "risks") data.risks = raw.map((p): RiskItem => ({ risk: p.left, mitigation: p.right }));
    else if (spec.id === "closure")
      data.closureCriteria = raw.map((p): ClosureCriterion => ({ criterion: p.left, metric: p.right }));
    push({ labelKey: spec.labelKey, status: raw.length ? "filled" : "empty", count: raw.length });
    await yieldFrame();
  }

  const input: Omit<TestPlanInput, "userId"> = {
    title,
    version: version || "1.0",
    planDate: planDate || null,
    author,
    status: status || "draft",
    data,
  };
  return { input, rows };
}
