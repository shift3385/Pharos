// Contract tests of the finding and metric importers (ING-06, ADR-0053):
// real samples (see each fixtures folder's README) against committed
// normalized snapshots, the vectors a port must reproduce.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePharosRun } from "../schema.js";
import {
  type ParsedReport,
  parseReportText,
  pageOf,
  severityOfImpact,
  standardRefsOf,
  wcagLevelOf,
} from "./index.js";

const FIXTURES = resolve(process.cwd(), "packages/formats/src/fixtures");
const read = (p: string) => readFileSync(join(FIXTURES, p), "utf8");

/** The same projection as importers.test.ts. */
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

const checkAndSnapshot = async (r: ParsedReport, name: string) => {
  expect(parsePharosRun(r.doc).ok).toBe(true);
  await expect(snapshot(r)).toMatchFileSnapshot(join(FIXTURES, name));
};

describe("axe-core results → findings and metrics", () => {
  it.each(["axe/pharos-dialog.json", "axe/checkout-broken.json"])(
    "%s matches its snapshot",
    async (sample) => {
      const r = parseReportText(read(sample));
      expect(r.format).toBe("axe");
      expect(r.doc.results).toEqual([]);
      await checkAndSnapshot(r, sample.replace("axe/", "axe/normalized/"));
    },
  );

  it("reads the @axe-core/cli array (one result per page) as one shard", async () => {
    const array = `[${read("axe/pharos-dialog.json")},${read("axe/checkout-broken.json")}]`;
    const r = parseReportText(array);
    const one = parseReportText(read("axe/pharos-dialog.json"));
    const two = parseReportText(read("axe/checkout-broken.json"));
    expect(r.doc.findings).toEqual([
      ...one.doc.findings!,
      ...two.doc.findings!,
    ]);
    expect(r.doc.metrics).toHaveLength(6);
    expect(r.doc.shards).toHaveLength(1);
  });

  it("maps the impact, the WCAG references and a review for incomplete", () => {
    const r = parseReportText(read("axe/checkout-broken.json"));
    const f = r.doc.findings!;
    const image = f.find((x) => x.ruleId === "image-alt")!;
    expect(image).toMatchObject({
      severity: "critical",
      rawSeverity: "critical",
      location: { selector: "img", html: '<img src="logo.png">' },
    });
    expect(image.standardRefs).toContain("WCAG2:1.1.1");
    expect(image.attributes).toMatchObject({
      wcagLevel: "A",
      axeResult: "violation",
    });
    const review = f.filter((x) => x.attributes?.needsReview);
    expect(review.length).toBeGreaterThan(0);
    expect(review.every((x) => x.severity === "info")).toBe(true);
    expect(
      r.doc.metrics!.find((m) => m.name === "axe.rules_violated")!.value,
    ).toBe(6);
  });

  it("gives a finding the same fingerprint whatever the query string", () => {
    const base = JSON.parse(read("axe/checkout-broken.json"));
    const a = parseReportText(
      JSON.stringify({ ...base, url: "https://shop.test/pay?session=1" }),
    );
    const b = parseReportText(
      JSON.stringify({ ...base, url: "https://shop.test/pay#top" }),
    );
    expect(a.doc.findings!.map((x) => x.fingerprint)).toEqual(
      b.doc.findings!.map((x) => x.fingerprint),
    );
    expect(new Set(a.doc.findings!.map((x) => x.fingerprint)).size).toBe(
      a.doc.findings!.length,
    );
  });
});

describe("finding helpers", () => {
  it("maps axe impacts to the common scale", () => {
    expect(
      ["critical", "serious", "moderate", "minor", null].map(severityOfImpact),
    ).toEqual(["critical", "high", "medium", "low", "info"]);
  });

  it("reads standard references from axe and SARIF tags", () => {
    expect(
      standardRefsOf([
        "wcag2aa",
        "wcag143",
        "wcag1410",
        "EN-9.1.4.3",
        "section508.22.a",
        "best-practice",
        "external/cwe/cwe-079",
        "CWE-89: SQL Injection",
        "owasp-top10-2021:A03",
        "wcag143",
      ]),
    ).toEqual([
      "WCAG2:1.4.3",
      "WCAG2:1.4.10",
      "EN301549:9.1.4.3",
      "S508:22.a",
      "CWE:79",
      "CWE:89",
      "OWASP:A03",
    ]);
    expect(wcagLevelOf(["cat.color", "wcag21aa"])).toBe("AA");
    expect(pageOf("https://a.test/p?q=1#x")).toBe("https://a.test/p");
  });
});
