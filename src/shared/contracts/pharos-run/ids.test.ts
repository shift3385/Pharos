import { describe, expect, it } from "vitest";
import vectors from "../../../../src-tauri/tests/fixtures/run-id-vectors.json";
import {
  NS_RESULT,
  NS_RUN_SHARD,
  NS_UNLINKED_MAPPING,
  importedResultId,
  manualTestKey,
  shardId,
  unlinkedMappingId,
} from "./ids";

describe("execution ids (twin of runs/ids.rs)", () => {
  it("use the namespaces of the desktop", () => {
    expect(vectors.namespaces).toEqual({
      runShard: NS_RUN_SHARD,
      result: NS_RESULT,
      unlinkedMapping: NS_UNLINKED_MAPPING,
    });
  });

  it("match the shared vectors", () => {
    for (const s of vectors.shards) expect(shardId(s.runId, s.sha256.toUpperCase())).toBe(s.id);
    for (const r of vectors.results) {
      expect(importedResultId(r.shardId, r.testKey, r.configurationLabel, r.attempt)).toBe(r.id);
    }
    for (const m of vectors.mappings) expect(unlinkedMappingId(m.projectId, m.testKey)).toBe(m.id);
    for (const k of vectors.manualKeys) expect(manualTestKey(k.caseId, k.flowId, k.rowId)).toBe(k.testKey);
  });
});
