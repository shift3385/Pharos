import type { ResultView } from "@shared/contracts/contract";
import type { LinkableCase } from "./types";

/** One imported test of a run that fulfils no item of it, by its final
 *  attempt (FIX-42). An imported run has no items: without these rows its
 *  screen said «no tiene casos» and «0/0 ejecutados» while it held results. */
export interface ImportedRow {
  id: string;
  /** The linked case's key and title (the current ones), or null. */
  caseKey: string | null;
  caseTitle: string | null;
  /** The test's name as the report gave it. */
  name: string;
  /** The dataset row it ran (from 0), if any. */
  exampleRow: number | null;
  configurationLabel: string | null;
  status: string;
  flaky: boolean;
  attempts: number;
}

/** The imported tests of `results` that fulfil no run item, one row per
 *  test (key and configuration label, as the final attempt is derived),
 *  with its attempts counted. Linked ones show their case. */
export function importedRows(results: ResultView[], cases: LinkableCase[]): ImportedRow[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const loose = results.filter((r) => r.shardId !== null && !r.effectiveRunItemId);
  const attempts = new Map<string, number>();
  const testOf = (r: ResultView) => `${r.testKey}\u0000${r.configurationLabel ?? ""}`;
  for (const r of loose) attempts.set(testOf(r), (attempts.get(testOf(r)) ?? 0) + 1);
  return loose
    .filter((r) => r.isFinal)
    .map((r) => {
      const linked = r.effectiveTestCaseId ? byId.get(r.effectiveTestCaseId) : undefined;
      const name = typeof r.attributes?.name === "string" && r.attributes.name ? r.attributes.name : r.testKey;
      return {
        id: r.id,
        caseKey: linked?.scenarioId ?? (r.effectiveTestCaseId ? r.caseKey : null),
        caseTitle: linked?.title ?? null,
        name,
        exampleRow: r.exampleRow,
        configurationLabel: r.configurationLabel,
        status: r.status,
        flaky: r.flaky,
        attempts: attempts.get(testOf(r)) ?? 1,
      };
    })
    .sort(
      (a, b) =>
        (a.caseKey ?? "￿").localeCompare(b.caseKey ?? "￿", undefined, { numeric: true }) ||
        (a.exampleRow ?? -1) - (b.exampleRow ?? -1) ||
        a.name.localeCompare(b.name),
    );
}
