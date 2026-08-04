import ExcelJS from "exceljs";
import esLocale from "@shared/i18n/locales/es.json";
import enLocale from "@shared/i18n/locales/en.json";
import {
  cellText,
  findLabel,
  indexCells,
  norm,
  preview,
  readValue,
  reverse,
  splitLines,
  type DetectionRow,
} from "@shared/import/xlsx";
import { detectLevel, fromGherkin, parseFeatureFlows } from "../ui/gherkin";
import type { TestCaseData } from "../model/types";

// --- Header-driven .xlsx case importer ---------------------------------------
// Reads a case spreadsheet by detecting section headers (es/en). Standard fields
// come from the case sheet; the level and flows are reconstructed from the
// Gherkin sheet using the existing mapper (so an advanced case round-trips). The
// scenario id is detected for the report only — the project re-numbers on save.

export type { DetectionRow, ImportProgress } from "@shared/import/xlsx";

export interface ImportedCase {
  scenarioId: string;
  title: string;
  version: string;
  status: string;
  priority: string;
  author: string;
  data: TestCaseData;
}

export interface CaseImportResult {
  input: ImportedCase;
  rows: DetectionRow[];
}

const tc = (loc: typeof esLocale) => loc.testCase as unknown as Record<string, Record<string, string>>;
const PRIORITY_REV = reverse(tc(esLocale).priorityLabel, tc(enLocale).priorityLabel);
const STATUS_REV = reverse(tc(esLocale).statusLabel, tc(enLocale).statusLabel);

type Kind = "text" | "list" | "steps" | "priority" | "status";

interface FieldSpec {
  id: string;
  labelKey: string;
  aliases: string[];
  kind: Kind;
  rev?: Map<string, string>;
}

const FIELDS: FieldSpec[] = [
  { id: "title", labelKey: "testCase.fieldTitle", aliases: ["titulo", "title"], kind: "text" },
  { id: "scenarioId", labelKey: "testCase.scenarioId", aliases: ["id de escenario", "scenario id"], kind: "text" },
  { id: "mappedUseCase", labelKey: "testCase.mappedUseCase", aliases: ["caso de uso mapeado", "mapped use case"], kind: "text" },
  { id: "version", labelKey: "testCase.version", aliases: ["version"], kind: "text" },
  { id: "caseDate", labelKey: "testCase.caseDate", aliases: ["fecha", "date"], kind: "text" },
  { id: "priority", labelKey: "testCase.priority", aliases: ["prioridad", "priority"], kind: "priority", rev: PRIORITY_REV },
  { id: "traceability", labelKey: "testCase.traceability", aliases: ["trazabilidad (id requisito/historia)", "traceability (requirement/story id)", "trazabilidad", "traceability"], kind: "text" },
  { id: "author", labelKey: "testCase.author", aliases: ["autor (nombre y apellidos)", "author (first and last name)", "autor", "author"], kind: "text" },
  { id: "status", labelKey: "testCase.status", aliases: ["estado", "status"], kind: "status", rev: STATUS_REV },
  { id: "description", labelKey: "testCase.description", aliases: ["descripcion", "description"], kind: "text" },
  { id: "preconditions", labelKey: "testCase.preconditions", aliases: ["precondiciones", "preconditions"], kind: "list" },
  { id: "steps", labelKey: "testCase.steps", aliases: ["pasos de prueba", "test steps"], kind: "steps" },
  { id: "expectedResult", labelKey: "testCase.expectedResult", aliases: ["resultado esperado", "expected result"], kind: "text" },
  { id: "postconditions", labelKey: "testCase.postconditions", aliases: ["postcondiciones", "postconditions"], kind: "list" },
  { id: "acceptanceCriteria", labelKey: "testCase.acceptanceCriteria", aliases: ["criterios de aceptacion", "acceptance criteria"], kind: "list" },
  { id: "testData", labelKey: "testCase.testData", aliases: ["datos de prueba", "test data"], kind: "text" },
  { id: "notes", labelKey: "testCase.notes", aliases: ["notas", "notes"], kind: "text" },
];

const SCALARS = new Set(["title", "scenarioId", "version", "priority", "status", "author"]);

const stripNumbering = (lines: string[]) => lines.map((s) => s.replace(/^\d+[.)]\s*/, ""));

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 24));

/**
 * Parses a case .xlsx into an ImportedCase plus a detection report. The scenario
 * id is detected for the report only (the project re-numbers on save). Level and
 * flows are reconstructed from the Gherkin sheet. `onProgress` fires per field.
 */
export async function parseCaseXlsx(
  buffer: ArrayBuffer,
  fileName: string,
  author: string,
  onProgress?: (p: import("@shared/import/xlsx").ImportProgress) => void,
): Promise<CaseImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets.find((w) => w.name !== "Gherkin") ?? wb.worksheets[0];
  const gherkinSheet = wb.getWorksheet("Gherkin");
  const cells = indexCells(ws);

  const data: TestCaseData = {};
  const scalar: Record<string, string> = {};
  const rows: DetectionRow[] = [];
  const total = FIELDS.length + 1; // +1 for the Gherkin level
  let done = 0;
  const push = (row: DetectionRow) => {
    rows.push(row);
    done += 1;
    onProgress?.({ done, total, row });
  };

  for (const spec of FIELDS) {
    const label = findLabel(cells, spec.aliases);
    if (!label) {
      push({ labelKey: spec.labelKey, status: "notFound" });
      await yieldFrame();
      continue;
    }
    const raw = readValue(ws, label, "below");
    let filled = raw.trim().length > 0;
    let prev: string | undefined = raw ? preview(raw.replace(/\n/g, " · ")) : undefined;

    switch (spec.kind) {
      case "text":
        if (SCALARS.has(spec.id)) scalar[spec.id] = raw;
        else (data as Record<string, unknown>)[spec.id] = raw;
        break;
      case "list": {
        const list = splitLines(raw);
        (data as Record<string, unknown>)[spec.id] = list;
        filled = list.length > 0;
        prev = list.length ? preview(list.join(", ")) : undefined;
        break;
      }
      case "steps": {
        const list = stripNumbering(splitLines(raw));
        data.steps = list;
        filled = list.length > 0;
        prev = list.length ? preview(list.join(", ")) : undefined;
        break;
      }
      case "priority":
      case "status": {
        const key = raw ? (spec.rev!.get(norm(raw)) ?? "") : "";
        scalar[spec.id] = key;
        filled = key.length > 0;
        prev = key || undefined;
        break;
      }
    }
    push({ labelKey: spec.labelKey, status: filled ? "filled" : "empty", preview: prev });
    await yieldFrame();
  }

  // Level + flows from the Gherkin sheet (source of truth for structure).
  const gherkin = gherkinSheet ? cellText(gherkinSheet.getCell("B4")).trim() : "";
  const level = gherkin ? detectLevel(gherkin) : "basic";
  data.gherkinLevel = level;
  if (level === "advanced") {
    const parsed = parseFeatureFlows(gherkin);
    data.background = parsed.background;
    data.flows = parsed.flows;
    data.featureSource = gherkin;
  } else if (level === "outline") {
    data.examples = fromGherkin(gherkin).examples ?? { headers: [], rows: [] };
  }
  push({ labelKey: "testCase.level.label", status: gherkin ? "filled" : "empty", preview: level });

  const input: ImportedCase = {
    scenarioId: scalar.scenarioId ?? "",
    title: scalar.title?.trim() || fileName.replace(/\.xlsx$/i, "").trim(),
    version: scalar.version || "1.0",
    status: scalar.status || "draft",
    priority: scalar.priority || "medium",
    author: scalar.author?.trim() || author,
    data,
  };
  return { input, rows };
}
