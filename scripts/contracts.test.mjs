import { test } from "node:test";
import assert from "node:assert/strict";
import { barrelGaps, BARREL, driftOf, GENERATED } from "./contracts.mjs";

test("driftOf: nothing to report when the folder is clean", () => {
  assert.deepEqual(driftOf(""), []);
  assert.deepEqual(driftOf(" M src/other/file.ts\n"), []);
});

test("driftOf: new, changed and stale generated files fail", () => {
  const porcelain = [
    `?? ${GENERATED}/NewType.ts`,
    ` M ${GENERATED}/Project.ts`,
    ` D ${GENERATED}/Gone.ts`,
    `M  ${GENERATED}/Staged.ts`,
    " M src/app/App.tsx",
  ].join("\n");
  assert.deepEqual(driftOf(porcelain), [
    `new (not committed): ${GENERATED}/NewType.ts`,
    `differs from the Rust type: ${GENERATED}/Project.ts`,
    `removed from Rust but still committed: ${GENERATED}/Gone.ts`,
    `differs from the Rust type: ${GENERATED}/Staged.ts`,
  ]);
});

test("barrelGaps: every generated type is re-exported, and nothing else", () => {
  const barrel = [
    'export type * from "./generated/Project";',
    'export type * from "./generated/Gone";',
  ].join("\n");
  assert.deepEqual(barrelGaps(["Project.ts", "Delta.ts"], barrel), [
    `not exported by ${BARREL}: Delta`,
    `${BARREL} exports a missing type: Gone`,
  ]);
  assert.deepEqual(barrelGaps(["Project.ts"], 'export type * from "./generated/Project";'), []);
});
