// Reads back the sheets of the 29119-3 sections (PLN-06) that the .xlsx
// export adds after the template's: «Estrategia 29119-3», «Métricas» and
// «Criterios de salida» (es or en). Each is found by its name and read by its
// headers; a file without them (exported before 0.4.0, or someone else's)
// simply brings none of these fields.
import type ExcelJS from "exceljs";
import esLocale from "@shared/i18n/locales/es.json";
import enLocale from "@shared/i18n/locales/en.json";
import { norm, reverse, splitLines, toKey } from "@shared/import/xlsx";
import { ESTIMATION_TECHNIQUES, INDEPENDENCE_LEVELS } from "../model/catalogs";
import { TECHNIQUE_REV } from "../model/catalogLabels";
import { METRIC_UNIT, isMetricKind, newMetricId, type MetricOp, type MetricUnit } from "../model/metrics";
import { STRATEGY_ROWS } from "../export/planStrategy";
import type { ClosureCriterion, Estimation, PlanMetric, TestPlanData } from "../model/types";

type Dict = Record<string, unknown>;
const tp = (loc: unknown) => (loc as { testPlan: Dict }).testPlan;
const get = (loc: unknown, path: string): string => {
  let cur: unknown = tp(loc);
  for (const k of path.split(".")) cur = (cur as Dict | undefined)?.[k];
  return typeof cur === "string" ? cur : "";
};
const both = (path: string) => [get(esLocale, path), get(enLocale, path)].filter(Boolean).map(norm);

const SHEETS = {
  strategy: both("strategySheet"),
  metrics: both("metricsSheet"),
  criteria: both("criteriaSheet"),
};

/** Label (es/en) of each strategy row → its field. */
const ROW_OF = new Map<string, (typeof STRATEGY_ROWS)[number][0]>(
  STRATEGY_ROWS.flatMap(([key, label]) => both(label.replace(/^testPlan\./, "")).map((l) => [l, key] as const)),
);
const INDEPENDENCE_REV = reverse(
  tp(esLocale).independenceLevel as Record<string, string>,
  tp(enLocale).independenceLevel as Record<string, string>,
);
const TECHNIQUE_LABEL_REV = reverse(
  tp(esLocale).estimationTechniqueLabel as Record<string, string>,
  tp(enLocale).estimationTechniqueLabel as Record<string, string>,
);
const UNIT_REV = reverse(
  tp(esLocale).metricUnit as Record<string, string>,
  tp(enLocale).metricUnit as Record<string, string>,
);
const KIND_REV = reverse(
  tp(esLocale).metricKind as Record<string, string>,
  tp(enLocale).metricKind as Record<string, string>,
);
const ADVISORY = new Set(both("closureLink.advisory"));
const SIGN_OP: Record<string, MetricOp> = { "≥": ">=", ">=": ">=", ">": ">", "≤": "<=", "<=": "<=", "<": "<", "=": "=" };

function sheet(wb: ExcelJS.Workbook, names: string[]): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((ws) => names.includes(norm(ws.name)));
}

const cellText = (row: ExcelJS.Row, col: number): string => {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("").trim();
  if (typeof v === "object" && "text" in v) return String(v.text).trim();
  return String(v).trim();
};

/** The data rows of a sheet (after its header), as text cells. */
function rows(ws: ExcelJS.Worksheet, cols: number): string[][] {
  const out: string[][] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    out.push(Array.from({ length: cols }, (_, i) => cellText(row, i + 1)));
  });
  return out;
}

/** «Técnica: Por proporciones», «Esfuerzo: 12»… back to the estimation. */
function parseEstimation(text: string): Estimation {
  const e: Estimation = {};
  const number = (s: string) => {
    const n = Number(s.replace(",", ".").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && s.trim() !== "" ? n : undefined;
  };
  for (const line of splitLines(text)) {
    const three = line.match(/^E\s*=\s*\(\s*([\d.,]+)\s*\+\s*4\s*·\s*([\d.,]+)\s*\+\s*([\d.,]+)\s*\)/);
    if (three) {
      e.technique = "threePoint";
      e.optimistic = number(three[1]);
      e.likely = number(three[2]);
      e.pessimistic = number(three[3]);
      continue;
    }
    const at = line.indexOf(":");
    if (at < 0) continue;
    const label = norm(line.slice(0, at));
    const value = line.slice(at + 1).trim();
    if (both("estimationTechnique").includes(label)) {
      const k = TECHNIQUE_LABEL_REV.get(norm(value)) ?? value;
      if ((ESTIMATION_TECHNIQUES as readonly string[]).includes(k)) e.technique ??= k as Estimation["technique"];
    } else if (both("effort").includes(label)) e.effort = number(value);
    else if (both("budget").includes(label)) e.budget = value;
    else if (both("estimationNotes").includes(label)) e.notes = value;
  }
  return e;
}

/** What the 29119-3 sheets of a workbook hold; empty when it has none. */
export function parseStrategySheets(wb: ExcelJS.Workbook): Partial<TestPlanData> {
  const data: Partial<TestPlanData> = {};

  const strategy = sheet(wb, SHEETS.strategy);
  if (strategy) {
    for (const [label, value] of rows(strategy, 2)) {
      const key = ROW_OF.get(norm(label));
      if (!key || !value) continue;
      switch (key) {
        case "techniques":
          data.techniques = splitLines(value).map((v) => toKey(v, TECHNIQUE_REV));
          break;
        case "independence": {
          const level = INDEPENDENCE_REV.get(norm(value)) ?? value;
          if ((INDEPENDENCE_LEVELS as readonly string[]).includes(level))
            data.independence = level as TestPlanData["independence"];
          break;
        }
        case "independenceNote":
          data.independenceNote = value;
          break;
        case "training":
          data.training = splitLines(value).map((line) => {
            const [need, ...when] = line.split(" — ");
            return { need: need.trim(), when: when.join(" — ").trim() };
          });
          break;
        case "estimation":
          data.estimation = parseEstimation(value);
          break;
        default:
          data[key] = splitLines(value);
      }
    }
  }

  const metricsSheet = sheet(wb, SHEETS.metrics);
  const metrics: PlanMetric[] = [];
  if (metricsSheet) {
    for (const [name, sign, target, unit, , , note, key] of rows(metricsSheet, 8)) {
      const kindKey = key || KIND_REV.get(norm(name)) || "";
      const kind = isMetricKind(kindKey) ? kindKey : null;
      if (!kind && !name) continue;
      const n = Number(target.replace(",", "."));
      const ownUnit = (UNIT_REV.get(norm(unit)) ?? "score") as MetricUnit;
      const m: PlanMetric = {
        id: newMetricId(metrics),
        kind,
        name: kind ? "" : name,
        op: SIGN_OP[sign] ?? ">=",
        target: Number.isFinite(n) ? n : 0,
        unit: kind ? METRIC_UNIT[kind] : ownUnit,
        ...(note ? { note } : {}),
      };
      metrics.push(m);
    }
    data.metrics = metrics;
  }

  const criteriaSheet = sheet(wb, SHEETS.criteria);
  if (criteriaSheet) {
    // «Medido por» names a metric: link to the first one with that name.
    const nameOf = (m: PlanMetric) => norm(m.kind ? get(esLocale, `metricKind.${m.kind}`) : m.name);
    const nameOfEn = (m: PlanMetric) => norm(m.kind ? get(enLocale, `metricKind.${m.kind}`) : m.name);
    data.closureCriteria = rows(criteriaSheet, 4)
      .filter(([criterion, metric]) => criterion || metric)
      .map(([criterion, metric, linked, type]): ClosureCriterion => {
        const target = linked ? metrics.find((m) => nameOf(m) === norm(linked) || nameOfEn(m) === norm(linked)) : undefined;
        const kind = norm(type);
        return {
          criterion,
          metric,
          ...(target ? { metricId: target.id } : {}),
          blocking: !ADVISORY.has(kind),
        };
      });
  }
  return data;
}
