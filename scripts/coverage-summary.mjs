// Coverage summary for the CI job summary (BASE-13). Reads the json-summary
// report that `npm run coverage` writes and prints a Markdown table of the
// totals. In GitHub Actions it appends the table to $GITHUB_STEP_SUMMARY, so
// every PR shows its coverage without PR comments (no write permissions).
//
//   node scripts/coverage-summary.mjs [coverage/coverage-summary.json]
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const METRICS = [
  ["lines", "Lines"],
  ["statements", "Statements"],
  ["functions", "Functions"],
  ["branches", "Branches"],
];

/** Markdown table of the `total` entry of an istanbul json-summary report. */
export function summaryTable(report, title = "Client coverage (Vitest)") {
  const total = report.total;
  if (!total) throw new Error("coverage summary has no `total` entry");
  const rows = METRICS.map(([key, label]) => {
    const m = total[key];
    if (!m) throw new Error(`coverage summary has no \`${key}\` total`);
    return `| ${label} | ${Number(m.pct).toFixed(2)} % | ${m.covered} / ${m.total} |`;
  });
  return [
    `### ${title}`,
    "",
    "| Metric | Covered | Count |",
    "| --- | ---: | ---: |",
    ...rows,
    "",
  ].join("\n");
}

function main(file) {
  const path = file ?? join(root, "coverage", "coverage-summary.json");
  const table = summaryTable(JSON.parse(readFileSync(path, "utf8")));
  console.log(table);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
  }
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(main(process.argv[2]));
}
