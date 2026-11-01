// Contract tests of the importers with the real ING-01 samples (sanitized:
// the spike's scratchpad path is `C:\work\ing01`). Each output is compared
// with a committed snapshot in `fixtures/ing01/normalized/`: the desktop
// persister's tests store those snapshots, and a later port of the parsers
// (INT-01) must reproduce them.

import { Blob as NodeBlob } from "node:buffer";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePharosRun } from "../schema";
import {
  type ParsedReport,
  ReportError,
  parseReportFile,
  parseReportText,
  relativizer,
  rowOfTitle,
  shardOf,
  testKey,
} from "./index";

const DIR = resolve(
  process.cwd(),
  "src/shared/contracts/pharos-run/fixtures/ing01",
);
const read = (p: string) => readFileSync(join(DIR, p), "utf8");
const parse = (p: string) => parseReportText(read(p));

const SAMPLES = [
  "single/cucumber-messages.ndjson",
  "single/ctrf.json",
  "single/pw.json",
  "single/pw-junit.xml",
  "single/cucumber-junit.xml",
  "shard1/cucumber-messages.ndjson",
  "shard1/ctrf.json",
  "shard1/pw.json",
  "shard1/pw-junit.xml",
  "shard2/cucumber-messages.ndjson",
  "shard2/ctrf.json",
  "shard2/pw.json",
  "shard2/pw-junit.xml",
  "merged/cucumber-messages.ndjson",
  "merged/ctrf.json",
  "merged/pw.json",
  "merged/pw-junit.xml",
  "ann/pw-junit.xml",
  "ann/ctrf.json",
  "ann/pw.json",
  "cuc/messages.ndjson",
  "cuc/junit.xml",
];

/** What the snapshot keeps: the document (inline bodies only as sizes). */
const snapshot = (r: ParsedReport) =>
  JSON.stringify(
    {
      format: r.format,
      warnings: r.warnings,
      inline: Object.fromEntries(
        [...r.inline].map(([k, v]) => [
          k,
          { encoding: v.encoding, length: v.data.length },
        ]),
      ),
      doc: r.doc,
    },
    null,
    2,
  ) + "\n";

const finals = (r: ParsedReport) => {
  const byKey = new Map<string, (typeof r.doc.results)[number]>();
  for (const x of r.doc.results) {
    const k = `${x.testKey}|${x.configurationLabel ?? ""}`;
    const prev = byKey.get(k);
    if (!prev || (x.attempt ?? 0) >= (prev.attempt ?? 0)) byKey.set(k, x);
  }
  return [...byKey.values()];
};

describe("importers · ING-01 samples", () => {
  it.each(SAMPLES)(
    "%s parses to a valid Pharos Run JSON matching its snapshot",
    async (sample) => {
      const r = parse(sample);
      expect(parsePharosRun(r.doc).ok).toBe(true);
      for (const x of r.doc.results) expect(x.testKey, x.name).toBeTruthy();
      await expect(snapshot(r)).toMatchFileSnapshot(
        join(DIR, "normalized", `${sample.replace(/[\\/]/g, "__")}.json`),
      );
    },
  );

  it("never lets the user's local paths into a sample or a test_key", () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) =>
        statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)],
      );
    for (const f of walk(DIR))
      expect(readFileSync(f, "utf8"), f).not.toMatch(/Users[\\/]+\w|AppData/i);
    for (const s of SAMPLES) {
      for (const x of parse(s).doc.results)
        expect(x.testKey, s).not.toMatch(/^[a-zA-Z]:\/|^\/|work\/ing01/);
    }
  });

  it("detects each format by content", () => {
    expect(parse("single/cucumber-messages.ndjson").format).toBe(
      "cucumber_messages",
    );
    expect(parse("single/ctrf.json").format).toBe("ctrf");
    expect(parse("single/pw.json").format).toBe("playwright_json");
    expect(parse("single/pw-junit.xml").format).toBe("junit");
    expect(() => parse("single/cucumber.json")).toThrow(ReportError);
    expect(() => parse("single/cucumber.json")).toThrow(/cucumber-json/);
    expect(() => parseReportText("{}")).toThrow(/unknown-format/);
    expect(() => parseReportText("<html/>")).toThrow(/unknown-format/);
  });

  it("gives the three Playwright reporters the same test_key per test", () => {
    const keys = (s: string) =>
      new Set(parse(s).doc.results.map((x) => x.testKey));
    const pw = keys("single/pw.json");
    expect(pw).toEqual(keys("single/ctrf.json"));
    expect(pw).toEqual(keys("single/pw-junit.xml"));
    expect(pw).toContain(
      "features/auth.feature.spec.js::Autenticacion › Login rechazado › Example #2",
    );
  });

  it("Messages: one result per attempt, Outline rows, hooks ignored (R4)", () => {
    for (const s of [
      "single/cucumber-messages.ndjson",
      "cuc/messages.ndjson",
    ]) {
      const r = parse(s);
      expect(r.doc.results).toHaveLength(6);
      const flaky = r.doc.results.filter((x) => x.tags?.includes("@TC-003"));
      expect(flaky.map((x) => [x.attempt, x.status])).toEqual([
        [0, "failed"],
        [1, "passed"],
      ]);
      expect(flaky[0].attributes?.willBeRetried).toBe(true);
      const rows = r.doc.results.filter((x) => x.tags?.includes("@TC-002"));
      expect(new Set(rows.map((x) => x.exampleRow))).toEqual(new Set([0, 1]));
      expect(
        rows.map((x) => x.testKey).every((k) => /\[[12]\]$/.test(k ?? "")),
      ).toBe(true);
      // Hooks never appear as steps.
      expect(
        r.doc.results
          .flatMap((x) => x.steps ?? [])
          .some((st) => /Hooks/.test(st.text ?? "")),
      ).toBe(false);
    }
    const pwBdd = parse("single/cucumber-messages.ndjson");
    expect(pwBdd.doc.shards[0].formatVersion).toBe("32.2.0");
    expect(parse("cuc/messages.ndjson").doc.shards[0].formatVersion).toBe(
      "34.2.1",
    );
    // The embedded attachments travel as inline bodies.
    expect(pwBdd.inline.size).toBeGreaterThan(0);
    expect(pwBdd.doc.attachments.every((a) => pwBdd.inline.has(a.ref))).toBe(
      true,
    );
  });

  it("CTRF: earlier attempts from retryAttempts, declared flaky, shard from environment", () => {
    const r = parse("shard2/ctrf.json");
    expect(r.doc.shards[0]).toMatchObject({
      shardIndex: 2,
      shardTotal: 2,
      sourceFormat: "ctrf",
      formatVersion: "0.2.0",
    });
    const flaky = r.doc.results.filter((x) => x.tags?.includes("@TC-003"));
    expect(flaky.map((x) => [x.attempt, x.status])).toEqual([
      [0, "failed"],
      [1, "passed"],
    ]);
    expect(flaky[1].attributes?.flaky).toBe(true);
    expect(
      r.doc.attachments.every((a) => a.path?.startsWith("C:\\work\\ing01")),
    ).toBe(true);
  });

  it("Playwright JSON: one result per retry, shard from config, merged report flagged", () => {
    const r = parse("shard2/pw.json");
    expect(r.doc.shards[0]).toMatchObject({ shardIndex: 2, shardTotal: 2 });
    expect(
      r.doc.results.every((x) => x.tags?.every((t) => t.startsWith("@"))),
    ).toBe(true);
    expect(
      finals(r).find((x) => x.tags?.includes("@TC-003"))?.attributes?.flaky,
    ).toBe(true);
    expect(parse("merged/pw.json").warnings).toContainEqual({
      code: "merged-without-shard",
    });
  });

  it("JUnit: no tags but the test_id property, cucumber-js rows, attachments by path", () => {
    expect(
      parse("single/pw-junit.xml").doc.results.every((x) => !x.tags?.length),
    ).toBe(true);
    const ann = parse("ann/pw-junit.xml").doc.results;
    expect(
      ann.find((x) => x.name.endsWith("Login con credenciales validas"))?.tags,
    ).toEqual(["@TC-001"]);
    expect(ann[0].attributes?.requirementKeys).toEqual(["REQ-014"]);
    const cuc = parse("cuc/junit.xml").doc.results;
    expect(cuc.find((x) => x.name === "Login rechazado - #1.2")).toMatchObject({
      status: "failed",
      exampleRow: 1,
    });
    expect(cuc[0].testKey).toBe(
      "Autenticacion::Login con credenciales validas",
    );
    const pw = parse("single/pw-junit.xml");
    expect(pw.doc.attachments.map((a) => a.path)).toContain(
      "..\\..\\test-results\\features-auth.feature-Aute-01b4c-n-Login-rechazado-Example-2\\error-context.md",
    );
  });

  it("JUnit: flaky and rerun elements are earlier failed attempts", () => {
    const xml = `<testsuite name="s"><testcase classname="a.B" name="t" time="1.5">
      <flakyFailure message="boom" type="E">trace</flakyFailure><flakyFailure message="again"/>
    </testcase><testcase classname="a.B" name="u"><rerunFailure message="x"/><failure message="y"/></testcase></testsuite>`;
    const r = parseReportText(xml).doc.results;
    expect(r.map((x) => [x.name, x.attempt, x.status])).toEqual([
      ["t", 0, "failed"],
      ["t", 1, "failed"],
      ["t", 2, "passed"],
      ["u", 0, "failed"],
      ["u", 1, "failed"],
    ]);
    expect(r[2]).toMatchObject({ duration: 1500, attributes: { flaky: true } });
    expect(r[4].attributes?.flaky).toBeUndefined();
  });

  it("Pharos Run JSON is taken as it is, deriving a missing testKey", () => {
    const r = parseReportText(
      JSON.stringify({
        schemaVersion: "1.2.0",
        results: [
          {
            name: "n",
            status: "passed",
            filePath: "C:\\repo\\tests\\a.spec.ts",
            suite: ["S"],
          },
        ],
      }),
    );
    expect(r.format).toBe("pharos_run_json");
    expect(r.doc.results[0].testKey).toBe("a.spec.ts::S › n");
    expect(() =>
      parseReportText(JSON.stringify({ schemaVersion: "2.0.0" })),
    ).toThrow(/invalid-pharos-run/);
  });

  it("reads NDJSON files line by line", async () => {
    const text = read("cuc/messages.ndjson");
    // Node's Blob: jsdom's has no `text()`/`stream()`.
    const r = await parseReportFile(new NodeBlob([text]) as unknown as Blob);
    expect(r.doc).toEqual(parseReportText(text).doc);
  });
});

describe("importers · helpers", () => {
  it("relativizes against a root, then strips the common directory of absolute paths", () => {
    const rel = relativizer([
      "C:\\Users\\me\\repo\\tests\\a.ts",
      "C:\\Users\\me\\repo\\tests\\sub\\b.ts",
      "rel/c.ts",
    ]);
    expect(rel("C:\\Users\\me\\repo\\tests\\sub\\b.ts")).toBe("sub/b.ts");
    expect(rel("rel/c.ts")).toBe("rel/c.ts");
    expect(relativizer(["/home/x/r/f.ts"], "/home/x/r")("/home/x/r/f.ts")).toBe(
      "f.ts",
    );
  });

  it("builds test keys and reads rows and shards", () => {
    expect(testKey("p.feature", ["Login"], 1)).toBe("p.feature::Login[2]");
    expect(testKey(undefined, ["A", "B"])).toBe("A › B");
    expect(rowOfTitle("Example #3")).toBe(2);
    expect(rowOfTitle("Login rechazado - #1.2")).toBe(1);
    expect(rowOfTitle("Login rechazado - #2.1")).toBeUndefined();
    expect(shardOf("2-of-3")).toEqual({ shardIndex: 2, shardTotal: 3 });
    expect(shardOf("2/2")).toEqual({ shardIndex: 2, shardTotal: 2 });
    expect(shardOf("4-of-3")).toBeUndefined();
  });
});
