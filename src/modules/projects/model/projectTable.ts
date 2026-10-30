// The Proyectos screen (SPEC §8, RED-V2): recent projects, then every project
// with search, filters, an order with direction and pages. Pure functions; the
// rows are loaded by `projectRows`.

import type { SortDirection } from "@shared/ui/SortMenu";

export interface ProjectRow {
  id: string;
  name: string;
  caseIdPrefix: string;
  caseIdDigits: number;
  updatedAt: string;
  /** Last time this user opened it on this device (null = never). */
  lastAccess: string | null;
  /** Plan status key, or null without a plan. */
  planStatus: string | null;
  cases: number;
  /** Covered requirements (0..1); null without requirements. */
  coverage: number | null;
  /** End of the test cycle from the plan's schedule; null when unknown. */
  closeDate: string | null;
}

/** Orders of the «Orden» menu. «execution» and «defects» have no data yet
 *  (execution arrives with 0.2.0): the screen offers them disabled. */
export const PROJECT_SORTS = [
  "access",
  "name",
  "updated",
  "closure",
  "execution",
  "coverage",
  "defects",
] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];
export const UNAVAILABLE_SORTS: ReadonlySet<ProjectSort> = new Set(["execution", "defects"]);

export const PAGE_SIZES = [12, 24, 48];
export const RECENT_COUNT = 4;

/** The prefix without its trailing separator («ATS_» → «ATS»), as the badge
 *  shows it and as the search matches it. */
export const prefixBadge = (prefix: string) =>
  prefix.replace(/[^\p{L}\p{N}]+$/u, "").slice(0, 4);

/** The last projects this user opened here, most recent first. */
export function recentProjects(rows: ProjectRow[], count = RECENT_COUNT): ProjectRow[] {
  return rows
    .filter((r) => r.lastAccess)
    .sort((a, b) => (b.lastAccess ?? "").localeCompare(a.lastAccess ?? ""))
    .slice(0, count);
}

/** Case- and accent-insensitive `query` inside `text`. */
export function matchesQuery(text: string, query: string): boolean {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return fold(text).includes(fold(query.trim()));
}

/** Name or prefix, ignoring case and accents. */
export function filterProjects(rows: ProjectRow[], query: string): ProjectRow[] {
  if (!query.trim()) return rows;
  return rows.filter(
    (r) => matchesQuery(r.name, query) || matchesQuery(r.caseIdPrefix, query),
  );
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** The value a row sorts by; null sorts last in either direction. */
function sortValue(row: ProjectRow, key: ProjectSort): string | number | null {
  switch (key) {
    case "access":
      return row.lastAccess ?? row.updatedAt;
    case "name":
      return row.name;
    case "updated":
      return row.updatedAt;
    case "closure":
      return row.closeDate;
    case "coverage":
      return row.coverage;
    default:
      return null;
  }
}

export function sortProjects(
  rows: ProjectRow[],
  key: ProjectSort,
  dir: SortDirection,
): ProjectRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null || vb === null) {
      if (va === vb) return collator.compare(a.name, b.name);
      return va === null ? 1 : -1;
    }
    const cmp =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : key === "name"
          ? collator.compare(String(va), String(vb))
          : String(va).localeCompare(String(vb));
    return cmp * sign || collator.compare(a.name, b.name);
  });
}

/** The rows of a 1-based page; a page past the end shows the last one. */
export function paginate<T>(rows: T[], page: number, size: number): { page: number; rows: T[] } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { page: current, rows: rows.slice((current - 1) * size, current * size) };
}

/** «Hoy, 09:42», «Ayer, 18:10», «27 oct» (and the year when it is not this one). */
export function formatAccess(
  iso: string,
  lang: string,
  words: { today: string; yesterday: string },
  now = new Date(),
): string {
  const when = new Date(iso);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(when)) / 86_400_000);
  const time = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(when);
  if (diff === 0) return `${words.today}, ${time}`;
  if (diff === 1) return `${words.yesterday}, ${time}`;
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
    year: when.getFullYear() === now.getFullYear() ? undefined : "numeric",
  })
    .format(when)
    .replace(".", "");
}

/** Coverage colour: ≥ 90 % meets the usual exit criterion, < 70 % is a gap. */
export function coverageTone(ratio: number): "success" | "warning" | "error" {
  return ratio >= 0.9 ? "success" : ratio >= 0.7 ? "warning" : "error";
}

/** Plan status → state colour (SPEC §4: Borrador neutral, Revisado info,
 *  Aprobado success, Obsoleto neutral struck through). */
export function planTone(status: string | null): "neutral" | "info" | "success" {
  return status === "reviewed" ? "info" : status === "approved" ? "success" : "neutral";
}

/** What is typed to confirm the deletion (SPEC §8): the prefix without its
 *  separator («PCL-» → «PCL»), or the name when the project has no prefix. */
export function deleteConfirmWord(project: { name: string; caseIdPrefix: string }): string {
  return project.caseIdPrefix.replace(/[^\p{L}\p{N}]+$/u, "").trim() || project.name.trim();
}
