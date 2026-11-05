import { cyclesTable, loadCycleExport } from "@modules/cycles";
import type { ExportTable } from "@shared/export/extraTables";
import type { StoredMilestone } from "../model/types";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** The milestones of step 14 as a table (EXP-03): the template has a sprint
 *  table but no place for them. Empty rows are left out. */
export function milestonesTable(
  milestones: readonly StoredMilestone[] | undefined,
  t: Translate,
): ExportTable {
  return {
    name: t("testPlan.milestones"),
    headers: [t("testPlan.milestoneName"), t("testPlan.date")],
    widths: [48, 16],
    rows: (milestones ?? [])
      .filter((m) => m.name.trim() || m.date)
      .map((m) => [m.name, m.date]),
  };
}

/** What a plan export adds after the template (EXP-03): its milestones and
 *  the project's cycles with their progress. A table without rows adds
 *  nothing. A failure to read the cycles fails the export, like the custom
 *  fields of a case: a sheet that silently left them out would mislead. */
export async function planExtraTables(
  projectId: string | null | undefined,
  userId: string,
  milestones: readonly StoredMilestone[] | undefined,
  t: Translate,
  lang: string,
): Promise<ExportTable[]> {
  const tables = [milestonesTable(milestones, t)];
  if (projectId) {
    tables.push(cyclesTable(await loadCycleExport(projectId, userId), t, lang));
  }
  return tables;
}
