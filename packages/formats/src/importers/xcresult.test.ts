// Contract tests of the `.xcresult` importer (ING-07): the fastlane samples
// (fixtures/xcresult/README.md) against committed normalized snapshots.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePharosRun } from "../schema.js";
import { type ParsedReport, parseReportText, xcDuration } from "./index.js";

const FIXTURES = resolve(process.cwd(), "packages/formats/src/fixtures");
const read = (p: string) => readFileSync(join(FIXTURES, p), "utf8");

/** The same projection as importers.test.ts. */
const snapshot = (r: ParsedReport) =>
  JSON.stringify(
    {
      format: r.format,
      warnings: r.warnings,
      inline: Object.fromEntries([...r.inline].map(([k, v]) => [k, { encoding: v.encoding, length: v.data.length }])),
      doc: r.doc,
    },
    null,
    2,
  ) + "\n";

const SAMPLES = ["xcresult/Xcode16-Mixed-XCTest-SwiftTesting.json", "xcresult/Xcode26-Mixed-XCTest-SwiftTesting.json"];

describe("xcresulttool test-results → results", () => {
  it.each(SAMPLES)("%s matches its snapshot", async (sample) => {
    const r = parseReportText(read(sample));
    expect(r.format).toBe("xcresult");
    expect(r.doc.schemaVersion).toBe("1.1.0");
    expect(parsePharosRun(r.doc).ok).toBe(true);
    await expect(snapshot(r)).toMatchFileSnapshot(join(FIXTURES, sample.replace("xcresult/", "xcresult/normalized/")));
  });

  it("keys by bundle and suites, makes retries attempts and arguments rows (Xcode 16)", () => {
    const r = parseReportText(read(SAMPLES[0]));
    expect(r.doc.run).toMatchObject({
      sourceTool: "xcode",
      context: { devices: ["iPhone 16 Pro · iOS Simulator 18.2"], testPlanConfigurations: ["MyTestPlanConfig"] },
    });
    const of = (key: string) => r.doc.results.filter((x) => x.testKey === key);
    // A UI test class in its own bundle: the suite repeats the bundle.
    const nav = of("FastlaneTrainerExampleUITests::testBasicNavigation()");
    expect(nav.map((x) => [x.status, x.attempt, x.attributes?.repetition])).toEqual([
      ["failed", 0, "Retry 1"],
      ["failed", 1, "Retry 2"],
    ]);
    expect(nav[1].message).toMatch(/^FastlaneTrainerExampleUITests\.swift:43: Failed to tap "Details" Button/);
    expect(nav[0].externalId).toBe("FastlaneTrainerExampleUITests/testBasicNavigation()");
    // Swift Testing: nested suites, rows of arguments, retries inside rows.
    const flags = r.doc.results.filter((x) => x.name === "Feature flag dependent tests");
    expect(flags.map((x) => [x.exampleRow, x.attempt, x.status, x.attributes?.arguments])).toEqual([
      [0, 0, "passed", '"basic_feature"'],
      [0, 1, "passed", '"basic_feature"'],
      [1, 0, "failed", '"experimental_feature"'],
      [1, 1, "failed", '"experimental_feature"'],
      [2, 0, "failed", '"premium_feature"'],
      [2, 1, "failed", '"premium_feature"'],
    ]);
    expect(flags[0].testKey).toBe(
      "FastlaneTrainerExampleTests::FastlaneTrainer Tests › Test Skipping Demonstrations › Feature Flag Tests › Feature flag dependent tests[1]",
    );
    // Arguments without repetitions are rows of one attempt.
    expect(r.doc.results.filter((x) => x.name === "testLaunch()").map((x) => [x.exampleRow, x.status])).toEqual([
      [0, "passed"],
      [1, "passed"],
      [2, "passed"],
      [3, "passed"],
    ]);
    // A skip keeps its reason; Swift Testing tags are tags.
    const premium = r.doc.results.find((x) => x.name === "Premium feature test")!;
    expect(premium).toMatchObject({ status: "skipped", tags: ["@validation"] });
    expect(premium.message).toMatch(/skipped: Premium features not available/);
  });

  it("reads durations with a decimal comma, minutes and Xcode 26's seconds", () => {
    expect(xcDuration({ duration: "0,011s" })).toBe(11);
    expect(xcDuration({ duration: "1m 3s" })).toBe(63_000);
    expect(xcDuration({ duration: "120ms" })).toBe(120);
    expect(xcDuration({ duration: "5s", durationInSeconds: 4.5 })).toBe(4500);
    expect(xcDuration({ duration: "soon" })).toBeUndefined();
  });
});
