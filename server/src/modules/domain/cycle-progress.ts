// Progress of a test cycle (CYC-01, ADR-0017), the TS twin of the desktop's
// `cycles/progress.rs` and `runs/derive.rs`: for each item × configuration,
// the latest final result among the cycle's runs; the worst across tests;
// `not_run` without results. Both are checked against
// `src-tauri/tests/fixtures/cycle-progress-vectors.json`.

export const NOT_RUN = "not_run";

export interface ProgressItem {
  id: string;
  caseId: string;
  flowId?: string | null;
  rowId?: string | null;
}

export interface ProgressAttempt {
  id: string;
  runId: string;
  testKey: string;
  configurationLabel?: string | null;
  attempt: number;
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  shardImportedAt?: string | null;
  hlc: string;
  /** The run's configuration, or the result's for a run without one. */
  configurationId?: string | null;
  /** `coalesce(testCaseId, unlinked mapping)`. */
  caseId?: string | null;
  flowId?: string | null;
  rowId?: string | null;
}

export interface ProgressCell {
  itemId: string;
  configurationId: string | null;
  status: string;
  resultId: string | null;
  runId: string | null;
}

const RFC = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|z|[+-]\d{2}:?\d{2})?$/;

/** Milliseconds since the epoch of an RFC 3339 timestamp or of SQLite's
 *  `datetime('now')` form (UTC); null otherwise (`derive::instant_ms`). */
export function instantMs(s: string): number | null {
  const m = RFC.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi, sec] = m.slice(1, 7).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 60) return null;
  const ms = m[7] ? Number(m[7].slice(0, 3).padEnd(3, "0")) : 0;
  let offset = 0;
  const tz = m[8];
  if (tz && tz !== "Z" && tz !== "z") {
    const digits = tz.replace(":", "");
    const oh = Number(digits.slice(1, 3));
    const om = Number(digits.slice(3, 5));
    if (oh > 23 || om > 59) return null;
    offset = (oh * 60 + om) * (tz.startsWith("-") ? -1 : 1);
  }
  // Days from the civil date (Howard Hinnant's algorithm), as in Rust: an
  // invalid day (Feb 30) rolls over the same way, and years 0–99 are years
  // 0–99 (`Date.UTC` would read them as 1900–1999).
  const [yy, mm] = mo <= 2 ? [y - 1, mo + 9] : [y, mo - 3];
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * mm + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const days = era * 146_097 + doe - 719_468;
  return (((days * 24 + h) * 60 + mi - offset) * 60 + sec) * 1000 + ms;
}

const time = (a: ProgressAttempt): number | null => {
  for (const t of [a.finishedAt, a.startedAt, a.shardImportedAt]) {
    if (typeof t === "string") {
      const v = instantMs(t);
      if (v !== null) return v;
    }
  }
  return null;
};

/** Time (missing first), then `attempt`, then HLC as bytes, then the id:
 *  equal attempts are decided alike everywhere (`progress.rs::cmp`). */
export function cmpAttempts(a: ProgressAttempt, b: ProgressAttempt): number {
  const [x, y] = [time(a), time(b)];
  if (x !== y) {
    if (x === null) return -1;
    if (y === null) return 1;
    return x < y ? -1 : 1;
  }
  if (a.attempt !== b.attempt) return a.attempt < b.attempt ? -1 : 1;
  if (a.hlc !== b.hlc) return a.hlc < b.hlc ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** failed > blocked > other (and anything unknown) > skipped > passed. */
const severity = (s: string) =>
  s === "failed" ? 4 : s === "blocked" ? 3 : s === "skipped" ? 1 : s === "passed" ? 0 : 2;

/** Ids of the final attempt of each test (run, test key, configuration label). */
export function finalAttempts(attempts: ProgressAttempt[]): Set<string> {
  const last = new Map<string, ProgressAttempt>();
  for (const a of attempts) {
    const key = JSON.stringify([a.runId, a.testKey, a.configurationLabel ?? ""]);
    const cur = last.get(key);
    if (!cur || cmpAttempts(a, cur) > 0) last.set(key, a);
  }
  return new Set([...last.values()].map((a) => a.id));
}

export function cells(
  items: ProgressItem[],
  configurations: (string | null)[],
  attempts: ProgressAttempt[],
): ProgressCell[] {
  const finals = finalAttempts(attempts);
  const live = attempts.filter((a) => finals.has(a.id));
  const out: ProgressCell[] = [];
  for (const item of items) {
    for (const configuration of configurations) {
      const latest = new Map<string, ProgressAttempt>();
      for (const a of live) {
        if ((a.configurationId ?? null) !== configuration || a.caseId !== item.caseId) continue;
        if (item.flowId && a.flowId !== item.flowId) continue;
        if (item.rowId && a.rowId !== item.rowId) continue;
        const key = JSON.stringify([a.testKey, a.configurationLabel ?? ""]);
        const cur = latest.get(key);
        if (!cur || cmpAttempts(a, cur) > 0) latest.set(key, a);
      }
      const all = [...latest.values()];
      // Sorted first and the last of the highest severity kept, as Rust's
      // `max_by_key` does: a tie between two unknown statuses is decided alike.
      const status = all.length
        ? all
            .map((a) => a.status)
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
            .reduce((w, s) => (severity(s) >= severity(w) ? s : w))
        : null;
      const decisive = status
        ? all.filter((a) => a.status === status).reduce((m, a) => (cmpAttempts(a, m) > 0 ? a : m))
        : null;
      out.push({
        itemId: item.id,
        configurationId: configuration,
        status: status ?? NOT_RUN,
        resultId: decisive?.id ?? null,
        runId: decisive?.runId ?? null,
      });
    }
  }
  return out;
}

export interface ProgressSummary {
  total: number;
  executed: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  other: number;
  notRun: number;
}

export const emptySummary = (): ProgressSummary => ({
  total: 0,
  executed: 0,
  passed: 0,
  failed: 0,
  blocked: 0,
  skipped: 0,
  other: 0,
  notRun: 0,
});

export function count(summary: ProgressSummary, status: string) {
  summary.total++;
  if (status === NOT_RUN) summary.notRun++;
  else {
    summary.executed++;
    if (status === "passed" || status === "failed" || status === "blocked" || status === "skipped") summary[status]++;
    else summary.other++;
  }
}
