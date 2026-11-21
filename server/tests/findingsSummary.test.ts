import { describe, expect, it } from "vitest";
import { findingsSummary, type FindingsInput } from "../src/modules/domain/findingsSummary";

// The summary's «new» needs a previous run of the same tool (ADR-0053 §6):
// the first import of a tool has nothing to compare with (FIX-48).

const input = (runs: { id: string; startedAt: string }[], findings: { runId: string; fingerprint: string }[]): FindingsInput => ({
  runs: runs.map((r) => ({ id: r.id, tool: "axe-core", startedAt: r.startedAt, createdAt: r.startedAt })),
  findings: findings.map((f) => ({ ...f, severity: "high", needsReview: false, caseId: null })),
  fingerprintsByRun: findings.reduce((m, f) => m.set(f.runId, (m.get(f.runId) ?? new Set()).add(f.fingerprint)), new Map<string, Set<string>>()),
  metrics: [],
  triage: new Map(),
});
const run = (id: string, startedAt: string) => ({ id, runKey: id.toUpperCase(), sourceTool: "axe-core", startedAt });

describe("findingsSummary · compared (FIX-48)", () => {
  it("a tool's first run is not compared: nothing is new", () => {
    const s = findingsSummary(input([{ id: "r1", startedAt: "2026-11-01" }], [{ runId: "r1", fingerprint: "a" }]), [run("r1", "2026-11-01")]);
    expect(s?.tools).toMatchObject([{ runId: "r1", compared: false, new: 0 }]);
  });

  it("a later run is compared with the previous one", () => {
    const s = findingsSummary(
      input(
        [
          { id: "r1", startedAt: "2026-11-01" },
          { id: "r2", startedAt: "2026-11-02" },
        ],
        [
          { runId: "r1", fingerprint: "a" },
          { runId: "r2", fingerprint: "a" },
          { runId: "r2", fingerprint: "b" },
        ],
      ),
      [run("r1", "2026-11-01"), run("r2", "2026-11-02")],
    );
    expect(s?.tools).toMatchObject([{ runId: "r2", compared: true, new: 1 }]);
  });
});
