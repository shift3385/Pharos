// Home data (SPEC §8 «Inicio», RED-V1). Pure aggregation over what exists
// today: projects, their live cases, the plan's schedule and closure criteria,
// and the planner's defects. Execution results arrive with 0.2.0 (RED-W6):
// until then nothing here invents pass/fail numbers.

/** A case waiting to be run (no case has been executed yet: no run model). */
export interface HomeCase {
  id: string;
  scenarioId: string;
  title: string;
  priority: string;
}

export interface HomeProject {
  id: string;
  name: string;
  /** Short key from the case-id prefix («PCL-» → «PCL»). */
  key: string;
  /** Last access on this device, else last update (most recent first). */
  recency: string;
  cases: HomeCase[];
  /** Plan schedule end (YYYY-MM-DD) or null; `hasPlan` false without a plan. */
  closeDate: string | null;
  hasPlan: boolean;
  criteria: { criterion: string; metric: string }[];
  openDefects: number;
  criticalDefects: number;
}

export interface HomeKpis {
  projects: number;
  closingThisMonth: number;
  pending: number;
  total: number;
  openDefects: number;
  criticalDefects: number;
}

/** «PCL-», «ATS_», «TC » → «PCL», «ATS», «TC». */
export function projectKey(prefix: string): string {
  return prefix.replace(/[^\p{L}\p{N}]+$/u, "").slice(0, 6);
}

/** Today's date as YYYY-MM-DD in local time. */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Short, localized date («7 nov») from YYYY-MM-DD. */
export function shortDate(iso: string, lang: string | undefined): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
  }).format(new Date(y, m - 1, d));
}

export function homeKpis(projects: HomeProject[], today: Date): HomeKpis {
  const month = isoDay(today).slice(0, 7);
  const sum = (f: (p: HomeProject) => number) =>
    projects.reduce((n, p) => n + f(p), 0);
  const total = sum((p) => p.cases.length);
  return {
    projects: projects.length,
    closingThisMonth: projects.filter(
      (p) => p.closeDate?.slice(0, 7) === month && p.closeDate >= isoDay(today),
    ).length,
    // No case has a result yet, so every live case is still pending.
    pending: total,
    total,
    openDefects: sum((p) => p.openDefects),
    criticalDefects: sum((p) => p.criticalDefects),
  };
}

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const rank = (priority: string) => PRIORITY_RANK[priority] ?? 4;

export interface QueueRow extends HomeCase {
  projectId: string;
  projectName: string;
}

/** «Próximas pruebas»: pending cases by priority, then by the project's
 *  recency, then by case id. */
export function upcomingTests(projects: HomeProject[], limit = 5): QueueRow[] {
  const rows = projects.flatMap((p, order) =>
    p.cases.map((c) => ({ ...c, projectId: p.id, projectName: p.name, order })),
  );
  rows.sort(
    (a, b) =>
      rank(a.priority) - rank(b.priority) ||
      a.order - b.order ||
      a.scenarioId.localeCompare(b.scenarioId),
  );
  return rows.slice(0, limit).map(({ order: _order, ...row }) => row);
}

/** Projects for the exit-criteria picker, by closing date (soonest first,
 *  undated last), filtered by name or key (accent- and case-insensitive). */
export function exitCriteriaChoices(
  projects: HomeProject[],
  query = "",
): HomeProject[] {
  const fold = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = fold(query.trim());
  return projects
    .filter((p) => !q || fold(p.name).includes(q) || fold(p.key).includes(q))
    .sort((a, b) => {
      if (a.closeDate && b.closeDate)
        return a.closeDate.localeCompare(b.closeDate);
      if (a.closeDate) return -1;
      if (b.closeDate) return 1;
      return 0;
    });
}

/** Default project of the exit-criteria card: the one that closes first from
 *  today, else the first one with a plan, else the first one. */
export function defaultExitProject(
  projects: HomeProject[],
  today: Date,
): HomeProject | null {
  const day = isoDay(today);
  const upcoming = exitCriteriaChoices(projects).filter(
    (p) => p.closeDate && p.closeDate >= day,
  );
  return upcoming[0] ?? projects.find((p) => p.hasPlan) ?? projects[0] ?? null;
}

// ---- Period (SPEC §8 «Inicio · periodo») ----

export const PERIODS = ["today", "7d", "14d", "30d", "month"] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = "14d";

export const isPeriod = (v: unknown): v is Period =>
  PERIODS.includes(v as Period);

/** The days of a period, oldest first and ending today. */
export function periodDays(period: Period, today: Date): Date[] {
  const count =
    period === "today"
      ? 1
      : period === "7d"
        ? 7
        : period === "14d"
          ? 14
          : period === "30d"
            ? 30
            : today.getDate();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() - (count - 1 - i));
    return d;
  });
}

/** Which day labels show under the bars: all on desktop; on tablet and
 *  mobile one day out of two counting back from today, which always shows
 *  (ACTUALIZACION §2). */
export function visibleDayLabels(count: number, alternate: boolean): boolean[] {
  return Array.from(
    { length: count },
    (_, i) => !alternate || (count - 1 - i) % 2 === 0,
  );
}
