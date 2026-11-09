// Test payloads shaped like contract v1 `HomeMetrics` (RED-W6). Tests only.
import type {
  DailyCount,
  HomeMetrics,
  ProgressSummary,
  ProjectMetrics,
  QueueRef,
  WindowRollup,
} from "./metrics";

export function counts(over: Partial<ProgressSummary> = {}): ProgressSummary {
  return {
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
    other: 0,
    notRun: 0,
    retest: 0,
    total: 0,
    executed: 0,
    ...over,
  };
}

export function rollup(over: Partial<WindowRollup> = {}): WindowRollup {
  const { total: _t, ...c } = counts();
  return { ...c, passRate: null, unlinked: 0, ...over };
}

export function day(over: Partial<DailyCount> = {}): DailyCount {
  const d = {
    dayStart: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
    other: 0,
    manual: 0,
    imported: 0,
    ...over,
  };
  return { ...d, total: d.manual + d.imported };
}

export function ref(caseId: string, scenarioId: string, title: string, priority: string): QueueRef {
  return { caseId, scenarioId, title, priority, flowId: null, rowId: null, lastAt: null };
}

export function projectMetrics(
  projectId: string,
  over: Partial<ProjectMetrics> = {},
): ProjectMetrics {
  return {
    projectId,
    counts: counts(),
    lastExecutedAt: null,
    defects: { open: 0, openBySeverity: { critical: 0, major: 0, minor: 0, trivial: 0 } },
    coverage: null,
    exitCriteria: [],
    queue: {
      notRun: [],
      blocked: [],
      retest: [],
      counts: { notRun: 0, blocked: 0, retest: 0 },
    },
    ...over,
  };
}

/** `days` empty buckets (the request's 30), then `over`. */
export function homeMetrics(over: Partial<HomeMetrics> = {}, days = 30): HomeMetrics {
  return {
    contractVersion: 1,
    daily: Array.from({ length: days }, () => day()),
    undated: 0,
    windows: {},
    projects: [],
    ...over,
  };
}
