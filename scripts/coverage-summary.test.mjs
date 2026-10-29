import { test } from "node:test";
import assert from "node:assert/strict";
import { summaryTable } from "./coverage-summary.mjs";

const metric = (covered, total, pct) => ({ covered, total, skipped: 0, pct });

const report = {
  total: {
    lines: metric(812, 1000, 81.2),
    statements: metric(830, 1040, 79.8076),
    functions: metric(150, 200, 75),
    branches: metric(400, 600, 66.6666),
  },
  "src/a.ts": { lines: metric(1, 1, 100) },
};

test("the table lists the four totals with two decimals", () => {
  const table = summaryTable(report);
  assert.match(table, /^### Client coverage \(Vitest\)$/m);
  assert.match(table, /^\| Lines \| 81\.20 % \| 812 \/ 1000 \|$/m);
  assert.match(table, /^\| Statements \| 79\.81 % \| 830 \/ 1040 \|$/m);
  assert.match(table, /^\| Functions \| 75\.00 % \| 150 \/ 200 \|$/m);
  assert.match(table, /^\| Branches \| 66\.67 % \| 400 \/ 600 \|$/m);
  assert.doesNotMatch(table, /src\/a\.ts/);
});

test("a report without totals is an error, not an empty table", () => {
  assert.throws(() => summaryTable({}), /no `total` entry/);
  assert.throws(
    () => summaryTable({ total: { lines: metric(1, 1, 100) } }),
    /no `statements` total/,
  );
});
