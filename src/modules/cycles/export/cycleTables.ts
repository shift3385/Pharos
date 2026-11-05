// The «Ciclos» tables of the plan and case exports (EXP-03). Progress comes
// from the cycle list's own summary (`cycle_list`, the same numbers and
// percents the «Ciclos» screen shows), never from one progress call per
// cycle. The tables are plain data: the plan and case exporters write them
// as a sheet of their own and a PDF section.
import i18n from "i18next";
import type { ExportTable } from "@shared/export/extraTables";
import { notify, ReportedError } from "@shared/ui/notify";
import { configurationApi, cycleApi } from "../api/cycleApi";
import { dateRange } from "../model/messages";
import {
  percents,
  type Configuration,
  type CycleItem,
  type CycleSummary,
} from "../model/types";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** What the exports read of a project's cycles: one list call, the
 *  configurations (archived ones too, to name them) and, only when asked,
 *  the items of every cycle (for the case exports). A failure is told in a
 *  toast and stops the export (`ReportedError`): a file that silently left
 *  the cycles out would mislead. */
export interface CycleExportData {
  cycles: CycleSummary[];
  configurations: Configuration[];
  items: Map<string, CycleItem[]>;
}

export async function loadCycleExport(
  projectId: string,
  userId: string,
  withItems = false,
): Promise<CycleExportData> {
  try {
    return await readCycles(projectId, userId, withItems);
  } catch (e) {
    const message = i18n.t("cycles.export.loadFailed");
    notify(message, "error");
    throw new ReportedError(`${message} (${String(e)})`);
  }
}

async function readCycles(
  projectId: string,
  userId: string,
  withItems: boolean,
): Promise<CycleExportData> {
  const cycles = await cycleApi.list(projectId, userId);
  const configurations = cycles.some((c) => c.configurationIds.length)
    ? await configurationApi.list(projectId, userId, true)
    : [];
  const items = new Map<string, CycleItem[]>();
  if (withItems) {
    for (const c of cycles) items.set(c.id, await cycleApi.items(c.id, userId));
  }
  return { cycles, configurations, items };
}

const status = (t: Translate, s: string) =>
  t(`cycles.status.${s}`, { defaultValue: s });

function configurationNames(
  ids: readonly string[],
  configurations: readonly Configuration[],
  t: Translate,
): string {
  return ids
    .map(
      (id) =>
        configurations.find((c) => c.id === id)?.name ??
        t("cycles.items.unknownConfiguration"),
    )
    .join(", ");
}

/** «x/y · z %», as the cycle list's progress bar says it. */
function progressText(c: CycleSummary, t: Translate): string {
  if (c.progress.total === 0) return t("cycles.progress.none");
  return `${c.progress.executed}/${c.progress.total} · ${percents(c.progress).passed} %`;
}

/** The project's cycles with their progress, for the plan export. */
export function cyclesTable(
  data: CycleExportData,
  t: Translate,
  lang = "es",
): ExportTable {
  const h = (k: string) => t(`cycles.export.${k}`);
  return {
    name: t("cycles.export.sheet"),
    headers: [
      h("key"),
      h("title"),
      h("status"),
      h("startsOn"),
      h("endsOn"),
      h("milestone"),
      h("sprint"),
      h("build"),
      h("environment"),
      h("configurations"),
      h("items"),
      h("runs"),
      h("total"),
      h("executed"),
      h("passed"),
      h("failed"),
      h("blocked"),
      h("notRun"),
      h("executedPct"),
      h("passedPct"),
    ],
    widths: [
      12, 32, 14, 12, 12, 18, 14, 12, 14, 28, 10, 8, 8, 10, 8, 8, 10, 12, 12,
      10,
    ],
    rows: data.cycles.map((c) => {
      const pct = percents(c.progress);
      return [
        c.cycleKey,
        c.title,
        status(t, c.status),
        c.startsOn ?? "",
        c.endsOn ?? "",
        c.milestone ?? "",
        c.sprint ?? "",
        c.build ?? "",
        c.environment ?? "",
        configurationNames(c.configurationIds, data.configurations, t),
        c.items,
        c.runs,
        c.progress.total,
        c.progress.executed,
        c.progress.passed,
        c.progress.failed,
        c.progress.blocked,
        c.progress.notRun,
        pct.executed,
        pct.passed,
      ];
    }),
    pdf: {
      headers: [
        h("key"),
        h("title"),
        h("status"),
        h("dates"),
        h("planned"),
        h("progress"),
      ],
      widths: ["12%", "28%", "12%", "18%", "15%", "15%"],
      rows: data.cycles.map((c) => [
        c.cycleKey,
        c.title,
        status(t, c.status),
        dateRange(c.startsOn, c.endsOn, lang) || "—",
        [c.milestone, c.sprint].filter(Boolean).join(" · ") || "—",
        progressText(c, t),
      ]),
    },
  };
}

/** The cycles a case belongs to, one row per item (a case can be in a cycle
 *  whole, or by flow or row), for the case export. */
export function caseCyclesTable(
  caseId: string,
  data: CycleExportData,
  t: Translate,
  lang = "es",
): ExportTable {
  const h = (k: string) => t(`cycles.export.${k}`);
  const rows: string[][] = [];
  for (const c of data.cycles) {
    for (const it of data.items.get(c.id) ?? []) {
      if (it.testCaseId !== caseId) continue;
      const scope = it.flowId
        ? t("cycles.items.flow", { id: it.flowId })
        : it.exampleRowId
          ? t("cycles.items.row", { id: it.exampleRowId })
          : t("cycles.export.wholeCase");
      rows.push([
        c.cycleKey,
        c.title,
        status(t, c.status),
        dateRange(c.startsOn, c.endsOn, lang),
        [c.milestone, c.sprint].filter(Boolean).join(" · "),
        configurationNames(c.configurationIds, data.configurations, t),
        scope,
        it.assignee ?? t("cycles.items.unassigned"),
      ]);
    }
  }
  const headers = [
    h("key"),
    h("title"),
    h("status"),
    h("dates"),
    h("planned"),
    h("configurations"),
    h("scope"),
    h("assignee"),
  ];
  return {
    name: t("cycles.export.sheet"),
    headers,
    widths: [12, 32, 14, 24, 22, 28, 16, 20],
    rows,
    pdf: {
      headers: [
        h("key"),
        h("title"),
        h("status"),
        h("dates"),
        h("scope"),
        h("assignee"),
      ],
      widths: ["13%", "29%", "13%", "17%", "13%", "15%"],
      rows: rows.map((r) => [r[0], r[1], r[2], r[3] || "—", r[6], r[7]]),
    },
  };
}
