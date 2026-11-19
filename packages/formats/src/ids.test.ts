import { describe, expect, it } from "vitest";
import vectors from "../../../src-tauri/tests/fixtures/run-id-vectors.json";
import {
  NS_FINDING,
  NS_FINDING_FINGERPRINT,
  NS_FINDING_TRIAGE,
  NS_METRIC,
  NS_RESULT,
  NS_RUN_SHARD,
  NS_STEP_RESULT,
  NS_UNLINKED_MAPPING,
  derivedFingerprint,
  findingId,
  findingTriageId,
  importedResultId,
  metricId,
  importedStepResultId,
  manualTestKey,
  shardId,
  unlinkedMappingId,
} from "./ids.js";

describe("execution ids (twin of runs/ids.rs)", () => {
  it("use the namespaces of the desktop", () => {
    expect(vectors.namespaces).toEqual({
      runShard: NS_RUN_SHARD,
      result: NS_RESULT,
      unlinkedMapping: NS_UNLINKED_MAPPING,
      stepResult: NS_STEP_RESULT,
      finding: NS_FINDING,
      metric: NS_METRIC,
      findingTriage: NS_FINDING_TRIAGE,
      findingFingerprint: NS_FINDING_FINGERPRINT,
    });
  });

  it("match the shared vectors", () => {
    for (const s of vectors.shards) expect(shardId(s.runId, s.sha256.toUpperCase(), s.normalizerVersion)).toBe(s.id);
    for (const r of vectors.results) {
      expect(importedResultId(r.shardId, r.testKey, r.configurationLabel, r.attempt)).toBe(r.id);
    }
    for (const m of vectors.mappings) expect(unlinkedMappingId(m.projectId, m.testKey)).toBe(m.id);
    for (const x of vectors.stepResults) expect(importedStepResultId(x.resultId, x.position)).toBe(x.id);
    for (const k of vectors.manualKeys) expect(manualTestKey(k.caseId, k.flowId, k.rowId)).toBe(k.testKey);
    // ING-06 (ADR-0053).
    for (const x of vectors.findings) expect(findingId(x.shardId, x.fingerprint, x.occurrence)).toBe(x.id);
    for (const x of vectors.metrics) expect(metricId(x.shardId, x.name, x.aggregation, x.scope)).toBe(x.id);
    for (const x of vectors.findingTriages) expect(findingTriageId(x.projectId, x.fingerprint)).toBe(x.id);
    for (const x of vectors.fingerprints) expect(derivedFingerprint(x.tool, x.ruleId, x.locationKey)).toBe(x.fingerprint);
  });
});
