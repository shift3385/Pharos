// Deterministic execution ids (ADR-0013, design 0.2.0 §3.3): the twin of
// `src-tauri/src/runs/ids.rs`; both check `run-id-vectors.json`. The UUIDv5
// name is the JCS of the parts as a JSON array; for strings and integers JCS
// is `JSON.stringify`, so no separator inside a `test_key` can make two
// different tuples collide. The importers (step 9) use them.

import { v5 } from "uuid";

export const NS_RUN_SHARD = "3b6d1f0a-8c2e-5d47-a913-6e0f2b8c4d71";
export const NS_RESULT = "9a4e7c21-0b5f-5e83-b6d2-1c9a3f70e845";
export const NS_UNLINKED_MAPPING = "5c8f2d93-e1a4-5b06-8f37-d4b26a10c9e2";
export const NS_STEP_RESULT = "e2b74c18-6d3a-5f91-b0c5-8a1d4e6f2b37";

const name = (parts: (string | number)[]) => JSON.stringify(parts);

/** The same file in the same run is the same shard on every device. */
export const shardId = (runId: string, sourceFileSha256: string) =>
  v5(name([runId, sourceFileSha256.toLowerCase()]), NS_RUN_SHARD);

export const importedResultId = (
  shard: string,
  testKey: string,
  configurationLabel: string | null | undefined,
  attempt: number,
) => v5(name([shard, testKey, configurationLabel ?? "", attempt]), NS_RESULT);

/** A step of an imported result: the same file gives the same steps on every
 *  device, so the append-only result converges (ADR-0013, step 9). */
export const importedStepResultId = (resultId: string, position: number) =>
  v5(name([resultId, position]), NS_STEP_RESULT);

export const unlinkedMappingId = (projectId: string, testKey: string) =>
  v5(name([projectId, testKey]), NS_UNLINKED_MAPPING);

/** `test_key` of a manual attempt: `manual:<case>/<flow|->/<row|->`. */
export const manualTestKey = (caseId: string, flowId?: string | null, rowId?: string | null) =>
  `manual:${caseId}/${flowId || "-"}/${rowId || "-"}`;
