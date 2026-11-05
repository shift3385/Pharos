import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  ExecutionFilter,
  ExecutionSummary,
} from "@shared/contracts/contract";

// The execution derivation (step 10, contract v1): the matrix (EJE-04), the
// status report (EJE-03) and the Home metrics (RED-W6) read it. The desktop
// derives it from its encrypted store (`execution.rs`); the web asks the
// server, which runs the TS twin over the same synced documents. Both are
// checked against `src-tauri/tests/fixtures/execution-vectors.json`.

/** The query string of a filter for `GET /api/execution/summary`. */
export function summaryQuery(filter: ExecutionFilter): string {
  const q = new URLSearchParams({ projectId: filter.projectId });
  for (const k of [
    "cycleId",
    "testPlanId",
    "configurationId",
    "build",
    "environment",
  ] as const) {
    const v = filter[k];
    if (v) q.set(k, v);
  }
  if (filter.from != null) q.set("from", String(filter.from));
  if (filter.to != null) q.set("to", String(filter.to));
  if (filter.dayStarts?.length) q.set("dayStarts", filter.dayStarts.join(","));
  return q.toString();
}

export const executionApi = {
  /** The summary of a project the user owns; null otherwise. */
  summary: (
    filter: ExecutionFilter,
    userId: string,
  ): Promise<ExecutionSummary | null> =>
    isTauri()
      ? invoke("execution_summary", { filter, userId })
      : serverApi.get(`/api/execution/summary?${summaryQuery(filter)}`),
};

/** Epoch ms of the local midnight of `day` (`YYYY-MM-DD`), for the period
 *  bounds and `dayStarts`: the client knows the time zone, the derivation
 *  never does. */
export function localDayStart(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** `[from, to)` in epoch ms for an inclusive range of local days. */
export function periodOf(
  fromDay: string | null,
  toDay: string | null,
): { from: number | null; to: number | null } {
  const next = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d + 1).getTime();
  };
  return {
    from: fromDay ? localDayStart(fromDay) : null,
    to: toDay ? next(toDay) : null,
  };
}
