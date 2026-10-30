// Casos · lista (RED-V3): filtering, counting and sorting of the case table as
// pure functions, so the list and the editor's «‹ anterior | N de M |
// siguiente ›» walk the same order.

import type { GherkinLevel, TestCaseStatus, TestCaseSummary } from "./types";

/** A case row: its summary plus the requirements it links (from the trace). */
export interface ListedCase extends TestCaseSummary {
  requirementKeys: string[];
}

export type StatusFilter = "all" | TestCaseStatus;

export interface CaseFilters {
  /** Matches the ID, the title or a linked requirement key. */
  query: string;
  status: StatusFilter;
  /** Empty = any. */
  priorities: ReadonlySet<string>;
  levels: ReadonlySet<GherkinLevel>;
}

export const EMPTY_FILTERS: CaseFilters = {
  query: "",
  status: "all",
  priorities: new Set(),
  levels: new Set(),
};

export type CaseSortId = "id" | "title" | "priority" | "status" | "updated";
export interface CaseSort {
  id: CaseSortId;
  dir: "asc" | "desc";
}
export const DEFAULT_SORT: CaseSort = { id: "id", dir: "asc" };

export const CASE_STATUSES: TestCaseStatus[] = ["draft", "reviewed", "approved", "obsolete"];
export const CASE_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export const CASE_LEVELS: GherkinLevel[] = ["basic", "outline", "advanced"];
export const CASE_PAGE_SIZES = [10, 25, 50];

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_RANK: Record<string, number> = { draft: 0, reviewed: 1, approved: 2, obsolete: 3 };

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function matchesQuery(c: ListedCase, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return [c.scenarioId, c.title, ...c.requirementKeys].some((v) => fold(v).includes(q));
}

/** Every filter but the state: the base of the state chips' counts. */
function matchesOthers(c: ListedCase, f: CaseFilters): boolean {
  return (
    matchesQuery(c, f.query) &&
    (f.priorities.size === 0 || f.priorities.has(c.priority)) &&
    (f.levels.size === 0 || f.levels.has(c.gherkinLevel))
  );
}

export function filterCases(cases: ListedCase[], f: CaseFilters): ListedCase[] {
  return cases.filter((c) => matchesOthers(c, f) && (f.status === "all" || c.status === f.status));
}

/** How many cases each state chip would show with the other filters on. */
export function statusCounts(cases: ListedCase[], f: CaseFilters): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { all: 0, draft: 0, reviewed: 0, approved: 0, obsolete: 0 };
  for (const c of cases) {
    if (!matchesOthers(c, f)) continue;
    counts.all++;
    if (c.status in counts) counts[c.status as TestCaseStatus]++;
  }
  return counts;
}

export function sortCases(cases: ListedCase[], sort: CaseSort): ListedCase[] {
  const by: Record<CaseSortId, (a: ListedCase, b: ListedCase) => number> = {
    id: (a, b) => natural(a.scenarioId, b.scenarioId),
    title: (a, b) => a.title.localeCompare(b.title),
    priority: (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9),
    status: (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
    updated: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
  };
  const dir = sort.dir === "asc" ? 1 : -1;
  // Ties keep the ID order, so equal priorities do not shuffle.
  return [...cases].sort((a, b) => by[sort.id](a, b) * dir || natural(a.scenarioId, b.scenarioId));
}
