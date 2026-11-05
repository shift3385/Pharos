import type { ExecutionSummary, LastResult } from "@shared/contracts/contract";

// A project's execution summary (contract v1) for the report and Home tests:
// a case passed in an imported Playwright run (flaky), one failed in a manual
// run and waits for a re-test, one blocked, one not run; a critical defect
// open; a high-risk requirement failing.

const last = (over: Partial<LastResult>): LastResult => ({
  resultId: "r",
  runId: "run1",
  runKey: "RUN-001",
  runTitle: "Manual",
  trigger: "manual",
  sourceTool: null,
  origin: "manual",
  at: "2026-11-01T10:00:00Z",
  status: "passed",
  configurationLabel: null,
  flaky: false,
  revisionId: "rev",
  stale: false,
  ...over,
});

export const SUMMARY: ExecutionSummary = {
  contractVersion: 1,
  projectId: "p1",
  filter: { projectId: "p1" },
  progress: { total: 4, executed: 3, passed: 1, failed: 0, blocked: 1, skipped: 0, other: 0, notRun: 1, retest: 1 },
  progressUnit: "case",
  passRate: 1 / 3,
  lastExecutedAt: "2026-11-02T09:00:01Z",
  cases: [
    {
      caseId: "c1", scenarioId: "TC-001", title: "Login", priority: "high", caseStatus: "approved",
      requirementKeys: ["REQ-001"], status: "passed",
      last: last({ resultId: "i1", runId: "run2", runKey: "RUN-002", runTitle: "CI", trigger: "import", sourceTool: "playwright", origin: "imported", at: "2026-11-02T09:00:01Z", configurationLabel: "chromium", flaky: true }),
      flowId: null, rowId: null, defectIds: [],
    },
    {
      caseId: "c2", scenarioId: "TC-002", title: "Pay", priority: "critical", caseStatus: "approved",
      requirementKeys: ["REQ-002"], status: "retest", last: last({ resultId: "m2", status: "failed", stale: true }),
      flowId: null, rowId: null, defectIds: ["d1"],
    },
    {
      caseId: "c3", scenarioId: "TC-003", title: "Refund", priority: "medium", caseStatus: "draft",
      requirementKeys: [], status: "blocked", last: last({ resultId: "m3", status: "blocked" }),
      flowId: null, rowId: null, defectIds: [],
    },
    {
      caseId: "c4", scenarioId: "TC-004", title: "Export", priority: "low", caseStatus: "draft",
      requirementKeys: [], status: "not_run", last: null, flowId: null, rowId: null, defectIds: [],
    },
  ],
  targets: [],
  requirements: [
    {
      requirementId: "q1", requirementKey: "REQ-001", title: "Login", priority: "high",
      riskLikelihood: 2, riskImpact: 2, riskLevel: 4, riskBand: "low", covered: true,
      caseIds: ["c1"], executedCases: 1, status: "passed", defectIds: [], inScope: true,
    },
    {
      requirementId: "q2", requirementKey: "REQ-002", title: "Payment", priority: "high",
      riskLikelihood: 5, riskImpact: 4, riskLevel: 20, riskBand: "high", covered: true,
      caseIds: ["c2"], executedCases: 1, status: "failed", defectIds: ["d1"], inScope: true,
    },
  ],
  coverage: {
    requirements: 2, covered: 2, coverageRatio: 1, executed: 2, passed: 1,
    byRisk: {
      high: { requirements: 1, covered: 1, executed: 1, passed: 0, failed: 1 },
      medium: { requirements: 0, covered: 0, executed: 0, passed: 0, failed: 0 },
      low: { requirements: 1, covered: 1, executed: 1, passed: 1, failed: 0 },
      unassessed: { requirements: 0, covered: 0, executed: 0, passed: 0, failed: 0 },
    },
  },
  defects: {
    total: 2, open: 1,
    bySeverity: {
      critical: { total: 1, open: 1 }, major: { total: 0, open: 0 },
      minor: { total: 1, open: 0 }, trivial: { total: 0, open: 0 },
    },
    openBySeverity: { critical: 1, major: 0, minor: 0, trivial: 0 },
    byStatus: { closed: 1, fixed: 1 },
  },
  exitCriteria: [
    { index: null, criterion: "% de casos ejecutados", metric: "≥ 95%", kind: "executed", op: ">=", target: 95, value: 75, met: false },
    { index: null, criterion: "Defectos críticos abiertos", metric: "0", kind: "criticalDefects", op: "=", target: 0, value: 1, met: false },
    { index: null, criterion: "Cobertura de requisitos", metric: "≥ 90%", kind: "coverage", op: ">=", target: 90, value: 100, met: true },
  ],
  daily: [],
  undated: 0,
  runs: [
    { id: "run2", runKey: "RUN-002", title: "CI", trigger: "import", sourceTool: "playwright", status: "completed", startedAt: "2026-11-02T09:00:00Z", cycleId: null, configurationId: null, build: "1.4.2", environment: "staging" },
    { id: "run1", runKey: "RUN-001", title: "Manual", trigger: "manual", sourceTool: null, status: "completed", startedAt: "2026-11-01T09:00:00Z", cycleId: null, configurationId: null, build: null, environment: null },
  ],
  options: { builds: ["1.4.2"], environments: ["staging"] },
};
