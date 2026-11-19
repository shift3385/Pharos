// Contract tests of the TRX importer (ING-07): the dorny/test-reporter
// samples (fixtures/trx/README.md) against committed normalized snapshots,
// and a small MSTest-shaped document for what those samples lack.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePharosRun } from "../schema.js";
import { type ParsedReport, isTrx, parseReportText, trxDuration } from "./index.js";

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

describe("TRX → results", () => {
  it.each(["trx/dotnet-trx.trx", "trx/dotnet-xunitv3.trx"])("%s matches its snapshot", async (sample) => {
    const r = parseReportText(read(sample));
    expect(r.format).toBe("trx");
    expect(r.doc.schemaVersion).toBe("1.1.0");
    expect(parsePharosRun(r.doc).ok).toBe(true);
    await expect(snapshot(r)).toMatchFileSnapshot(join(FIXTURES, sample.replace("trx/", "trx/normalized/") + ".json"));
  });

  it("keys a test by its class and name, and maps the outcomes", () => {
    const r = parseReportText(read("trx/dotnet-trx.trx"));
    expect(r.doc.run.sourceTool).toBe("xunit");
    const byKey = new Map(r.doc.results.map((x) => [x.testKey, x]));
    const passing = byKey.get("DotnetTests/XUnitTests/CalculatorTests::Passing_Test")!;
    expect(passing).toMatchObject({ status: "passed", rawStatus: "Passed", attempt: 0 });
    expect(byKey.get("DotnetTests/XUnitTests/CalculatorTests::Skipped_Test")).toMatchObject({
      status: "skipped",
      rawStatus: "NotExecuted",
    });
    const theory = byKey.get("DotnetTests/XUnitTests/CalculatorTests::Should be even number(i: 3)")!;
    expect(theory.status).toBe("failed");
    expect(theory.message).toMatch(/^Assert\.True\(\) Failure/);
    expect(theory.trace).toContain("CalculatorTests.cs:line 67");
    expect(r.doc.results.filter((x) => x.rawStatus === "Error").every((x) => x.status === "failed")).toBe(true);
  });

  it("tells TRX from JUnit by the root element", () => {
    expect(isTrx(read("trx/dotnet-trx.trx"))).toBe(true);
    expect(isTrx('<?xml version="1.0"?>\n<testsuites><testsuite name="a"/></testsuites>')).toBe(false);
  });

  it("reads durations of hours and days", () => {
    expect(trxDuration("00:00:00.1084258")).toBe(108);
    expect(trxDuration("01:02:03.5")).toBe(3_723_500);
    expect(trxDuration("1.00:00:01")).toBe(86_401_000);
    expect(trxDuration("soon")).toBeUndefined();
  });

  it("links by [TestCategory], turns data rows into rows and retries into attempts (MSTest)", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<TestRun id="r" name="ci@agent" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">
  <Times start="2026-11-19T10:00:00Z" finish="2026-11-19T10:01:00Z" />
  <Results>
    <UnitTestResult testId="t1" testName="Adds" outcome="Failed" startTime="2026-11-19T10:00:01Z" duration="00:00:00.5" relativeResultsDirectory="d1">
      <InnerResults>
        <UnitTestResult testId="t1" testName="Adds (1,2,3)" outcome="Passed" startTime="2026-11-19T10:00:01Z" duration="00:00:00.1" />
        <UnitTestResult testId="t1" testName="Adds (2,2,5)" outcome="Failed" startTime="2026-11-19T10:00:02Z" duration="00:00:00.1">
          <Output><ErrorInfo><Message>Expected 5, was 4</Message></ErrorInfo></Output>
        </UnitTestResult>
      </InnerResults>
    </UnitTestResult>
    <UnitTestResult testId="t2" testName="Pays" outcome="Failed" startTime="2026-11-19T10:00:03Z" relativeResultsDirectory="d2" />
    <UnitTestResult testId="t2" testName="Pays" outcome="Passed" startTime="2026-11-19T10:00:09Z" relativeResultsDirectory="d3">
      <ResultFiles><ResultFile path="shots\\pay.png" /></ResultFiles>
    </UnitTestResult>
    <UnitTestResult testId="t3" testName="Later" outcome="Inconclusive" startTime="2026-11-19T10:00:10Z" />
  </Results>
  <TestDefinitions>
    <UnitTest id="t1" name="Adds" storage="c:\\src\\app\\bin\\app.tests.dll">
      <TestCategory><TestCategoryItem TestCategory="TC-12" /></TestCategory>
      <TestMethod className="App.Tests.MathTests" name="Adds" adapterTypeName="executor://mstestadapter/v2" />
    </UnitTest>
    <UnitTest id="t2" name="Pays" storage="c:\\src\\app\\bin\\app.tests.dll">
      <TestCategory><TestCategoryItem TestCategory="@TC-13" /><TestCategoryItem TestCategory="smoke" /></TestCategory>
      <TestMethod className="App.Tests.PayTests" name="Pays" adapterTypeName="executor://mstestadapter/v2" />
    </UnitTest>
    <UnitTest id="t3" name="Later" storage="c:\\src\\app\\bin\\app.tests.dll">
      <TestMethod className="App.Tests.PayTests" name="Later" adapterTypeName="executor://mstestadapter/v2" />
    </UnitTest>
  </TestDefinitions>
</TestRun>`;
    const r = parseReportText(xml);
    expect(r.format).toBe("trx");
    expect(parsePharosRun(r.doc).ok).toBe(true);
    expect(r.doc.run).toMatchObject({ sourceTool: "mstest", startedAt: "2026-11-19T10:00:00Z" });
    const rows = r.doc.results.filter((x) => x.name === "Adds");
    expect(rows.map((x) => [x.testKey, x.exampleRow, x.status, x.tags])).toEqual([
      ["App/Tests/MathTests::Adds[1]", 0, "passed", ["@TC-12"]],
      ["App/Tests/MathTests::Adds[2]", 1, "failed", ["@TC-12"]],
    ]);
    expect(rows[1]).toMatchObject({ message: "Expected 5, was 4", attributes: { dataRow: "Adds (2,2,5)" } });
    const pays = r.doc.results.filter((x) => x.name === "Pays");
    expect(pays.map((x) => [x.attempt, x.status, x.tags])).toEqual([
      [0, "failed", ["@TC-13", "@smoke"]],
      [1, "passed", ["@TC-13", "@smoke"]],
    ]);
    expect(r.doc.attachments).toEqual([{ ref: "a1", name: "pay.png", kind: "evidence", path: "d3/shots/pay.png" }]);
    expect(pays[1].attachments).toEqual(["a1"]);
    expect(r.doc.results.find((x) => x.name === "Later")).toMatchObject({ status: "other", rawStatus: "Inconclusive" });
  });
});
