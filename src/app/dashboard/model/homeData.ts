// Home data (SPEC §8 «Inicio», RED-V1): what does not come from executions —
// the projects and their plan's schedule and closure criteria — plus the
// period. Cases, results and defects are counted by the metrics (`metrics.ts`,
// RED-W6), from the shared derivation.

export interface HomeProject {
  id: string;
  name: string;
  /** Short key from the case-id prefix («PCL-» → «PCL»). */
  key: string;
  /** Plan schedule end (YYYY-MM-DD) or null; `hasPlan` false without a plan. */
  closeDate: string | null;
  hasPlan: boolean;
  criteria: { criterion: string; metric: string }[];
}

/** The KPIs that do not come from executions (those are `executionKpis`). */
export interface HomeKpis {
  projects: number;
  closingThisMonth: number;
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
  return {
    projects: projects.length,
    closingThisMonth: projects.filter(
      (p) => p.closeDate?.slice(0, 7) === month && p.closeDate >= isoDay(today),
    ).length,
  };
}

/** Projects for the exit-criteria picker by closing date (upcoming soonest
 *  first, then undated, then past), filtered by name or key (accent- and case-insensitive). */
export function exitCriteriaChoices(
  projects: HomeProject[],
  query: string,
  today: Date,
): HomeProject[] {
  const day = isoDay(today);
  // Upcoming first (soonest first), then undated, then already closed (most
  // recently closed first).
  const group = (p: HomeProject) =>
    !p.closeDate ? 1 : p.closeDate >= day ? 0 : 2;
  const fold = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = fold(query.trim());
  return projects
    .filter((p) => !q || fold(p.name).includes(q) || fold(p.key).includes(q))
    .sort((a, b) => {
      const g = group(a) - group(b);
      if (g || !a.closeDate || !b.closeDate) return g;
      return group(a) === 2
        ? b.closeDate.localeCompare(a.closeDate)
        : a.closeDate.localeCompare(b.closeDate);
    });
}

/** Default project of the exit-criteria card: the one that closes first from
 *  today, else the first one with a plan, else the first one. */
export function defaultExitProject(
  projects: HomeProject[],
  today: Date,
): HomeProject | null {
  const day = isoDay(today);
  const upcoming = exitCriteriaChoices(projects, "", today).filter(
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
