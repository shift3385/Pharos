// `.xcresult` (Xcode: XCTest and Swift Testing) → Pharos Run JSON (ING-07,
// plan F §7.6). A `.xcresult` bundle is an undocumented store only
// `xcresulttool` reads (macOS with Xcode), so what is imported is its
// documented JSON: `xcrun xcresulttool get test-results tests --path X.xcresult`
// (Xcode 16 and later), a tree of `testNodes`.
//
// - A `Test Case` is a test. Its key: the test bundle as the path, and the
//   suites (`Test Suite`) and the case's name as titles; its
//   `nodeIdentifier` (stable when a Swift Testing display name changes) is
//   the result's `externalId`.
// - `Arguments` (parameterized tests) are rows, in order.
// - `Repetition` (`Retry n`, `First Run`…: test repetitions and retries on
//   failure) are attempts, in order; a passed last one after a failure is
//   flaky.
// - `Failure Message` nodes are the message (a skip's reason too).
// - Swift Testing `tags` are tags. They are Swift identifiers (no `-`), so
//   a key such as `TC-12` rarely fits: the link is usually made in the
//   unlinked tray, which remembers it.

import { type ImportResult, type ParsedReport, type ResultStatus, atTag, emptyDoc, uniqueTags } from "./common.js";

export interface XcTestNode {
  nodeType?: string;
  name?: string;
  nodeIdentifier?: string;
  result?: string;
  duration?: string;
  durationInSeconds?: number;
  details?: string;
  tags?: string[];
  children?: XcTestNode[];
}
export interface XcTestResults {
  testNodes: XcTestNode[];
  devices?: { deviceName?: string; modelName?: string; osVersion?: string; platform?: string; architecture?: string }[];
  testPlanConfigurations?: { configurationId?: string; configurationName?: string }[];
}

/** True for `xcresulttool get test-results tests` output. */
export function isXcTestResults(v: unknown): v is XcTestResults {
  const o = v as Record<string, unknown> | null;
  return (
    !!o &&
    typeof o === "object" &&
    Array.isArray(o.testNodes) &&
    (o.testNodes as unknown[]).every((n) => !!n && typeof n === "object" && "nodeType" in (n as object))
  );
}

const STATUS: Record<string, ResultStatus> = {
  passed: "passed",
  // An expected failure (XCTExpectFailure, withKnownIssue) passes.
  "expected failure": "passed",
  failed: "failed",
  skipped: "skipped",
};
const statusOf = (result: string | undefined): ResultStatus => STATUS[(result ?? "").toLowerCase()] ?? "other";

/** `5s`, `0,011s` (decimal comma), `1m 3s`, `2h 1m`, `120ms` → milliseconds;
 *  `durationInSeconds` (Xcode 26) wins. */
export function xcDuration(n: Pick<XcTestNode, "duration" | "durationInSeconds">): number | undefined {
  if (typeof n.durationInSeconds === "number" && Number.isFinite(n.durationInSeconds) && n.durationInSeconds >= 0)
    return Math.round(n.durationInSeconds * 1000);
  const text = (n.duration ?? "").trim().replace(/,/g, ".");
  if (!text) return undefined;
  const unit: Record<string, number> = { h: 3_600_000, m: 60_000, min: 60_000, s: 1000, ms: 1 };
  let total = 0;
  let matched = "";
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(ms|min|h|m|s)/g)) {
    total += Number(m[1]) * unit[m[2]];
    matched += m[0];
  }
  return matched && Number.isFinite(total) ? Math.round(total) : undefined;
}

const SUITES = new Set(["Test Suite"]);
const BUNDLES = new Set(["Unit test bundle", "UI test bundle", "Test bundle"]);

export function parseXcresult(input: XcTestResults): ParsedReport {
  const doc = emptyDoc("xcresult");
  const context: Record<string, unknown> = {};
  const devices = (input.devices ?? []).map((d) =>
    [d.deviceName ?? d.modelName, d.platform && d.osVersion ? `${d.platform} ${d.osVersion}` : (d.platform ?? d.osVersion)]
      .filter(Boolean)
      .join(" · "),
  );
  if (devices.length) context.devices = devices;
  const configurations = (input.testPlanConfigurations ?? []).map((c) => c.configurationName).filter(Boolean);
  if (configurations.length) context.testPlanConfigurations = configurations;
  doc.run = { trigger: "import", sourceTool: "xcode", context };

  const failures = (n: XcTestNode) =>
    (n.children ?? [])
      .filter((c) => c.nodeType === "Failure Message" && c.name)
      .map((c) => c.name!)
      .join("\n");
  const repetitions = (n: XcTestNode) => (n.children ?? []).filter((c) => c.nodeType === "Repetition");

  /** The attempts of one test (or one row of it). */
  const emit = (testCase: XcTestNode, bundle: string, suites: string[], node: XcTestNode, row?: number) => {
    const reps = repetitions(node);
    const runs = reps.length ? reps : [node];
    const statuses = runs.map((r) => statusOf(r.result));
    const tags = uniqueTags((testCase.tags ?? []).map(atTag));
    const titles = [...suites, testCase.name ?? testCase.nodeIdentifier ?? "test"];
    const key = [bundle, titles.join(" › ")].filter(Boolean).join("::");
    runs.forEach((r, attempt) => {
      const status = statuses[attempt];
      const isLast = attempt === runs.length - 1;
      const flaky = isLast && status === "passed" && statuses.slice(0, -1).includes("failed");
      // Without repetitions, the failures hang from the case or the row.
      const message = failures(r) || (reps.length ? "" : failures(node));
      const duration = xcDuration(r);
      const attributes: Record<string, unknown> = {};
      if (flaky) attributes.flaky = true;
      if (row !== undefined) attributes.arguments = node.name ?? "";
      if (reps.length) attributes.repetition = r.name ?? "";
      if (testCase.details) attributes.details = testCase.details;
      doc.results.push({
        name: testCase.name ?? "test",
        testKey: row === undefined ? key : `${key}[${row + 1}]`,
        ...(bundle || suites.length ? { suite: [bundle, ...suites].filter(Boolean) } : {}),
        tags,
        ...(row !== undefined ? { exampleRow: row } : {}),
        status,
        rawStatus: r.result ?? "",
        attempt,
        ...(testCase.nodeIdentifier ? { externalId: testCase.nodeIdentifier } : {}),
        ...(duration !== undefined ? { duration } : {}),
        ...(message ? { message } : {}),
        shardRef: "s1",
        attributes,
      } as ImportResult);
    });
  };

  const walk = (n: XcTestNode, bundle: string, suites: string[]) => {
    if (n.nodeType === "Test Case") {
      const args = (n.children ?? []).filter((c) => c.nodeType === "Arguments");
      if (args.length) args.forEach((a, row) => emit(n, bundle, suites, a, row));
      else emit(n, bundle, suites, n);
      return;
    }
    const nextBundle = BUNDLES.has(n.nodeType ?? "") ? (n.name ?? bundle) : bundle;
    // A suite named as its bundle (an XCTest class in its own target) adds nothing.
    const nextSuites =
      SUITES.has(n.nodeType ?? "") && n.name && !(suites.length === 0 && n.name === bundle) ? [...suites, n.name] : suites;
    for (const c of n.children ?? []) walk(c, nextBundle, nextSuites);
  };
  for (const n of input.testNodes) walk(n, "", []);

  return {
    format: "xcresult",
    doc,
    inline: new Map(),
    warnings: doc.results.length ? [] : [{ code: "no-results" }],
  };
}
