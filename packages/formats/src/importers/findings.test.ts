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

const SARIF_SAMPLES = [
  "sarif/eslint.sarif",
  "sarif/sarif-sdk-suppressions.sarif",
  "sarif/trivy-misconfig.sarif",
];

describe("SARIF → findings", () => {
  it.each(SARIF_SAMPLES)("%s matches its snapshot", async (sample) => {
    const r = parseReportText(read(sample));
    expect(r.format).toBe("sarif");
    expect(r.doc.results).toEqual([]);
    await checkAndSnapshot(
      r,
      sample.replace("sarif/", "sarif/normalized/") + ".json",
    );
  });

  it("makes CI and Windows paths repo-relative and maps the levels", () => {
    const eslint = parseReportText(read("sarif/eslint.sarif")).doc.findings!;
    expect(
      eslint.every((f) =>
        /^src\/modules\/runs\//.test(String(f.location?.uri)),
      ),
    ).toBe(true);
    expect(
      new Set(eslint.map((f) => `${f.rawSeverity}→${f.severity}`)),
    ).toEqual(new Set(["warning→medium", "error→high"]));
    const sdk = parseReportText(read("sarif/sarif-sdk-suppressions.sarif")).doc
      .findings!;
    expect(sdk.map((f) => f.location?.uri)).toEqual([
      "code/file1.c",
      "code/file2.c",
      "code/file3.c",
      "code/file4.c",
    ]);
    expect(sdk.map((f) => Boolean(f.attributes?.suppressed))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("reads Trivy's security-severity and a uriBaseId path", () => {
    const [root, health] = parseReportText(read("sarif/trivy-misconfig.sarif"))
      .doc.findings!;
    expect(root).toMatchObject({
      ruleId: "DS002",
      severity: "high",
      rawSeverity: "error · security-severity 8",
      location: { uri: "server/Dockerfile", line: 1 },
    });
    expect(health.ruleId).toBe("DS026");
  });

  it("skips what is not a problem, uses security-severity and the tool's fingerprint", () => {
    const log = JSON.parse(
      read("sarif/sarif-sdk-suppressions.sarif").trimStart(), // drops the BOM
    );
    const [a, b, c, d] = log.runs[0].results;
    a.kind = "pass";
    b.baselineState = "absent";
    c.properties = {
      "security-severity": "9.8",
      tags: ["external/cwe/cwe-089"],
    };
    c.partialFingerprints = { primaryLocationLineHash: "abc:1" };
    d.level = "note";
    const r = parseReportText(JSON.stringify(log));
    expect(r.warnings).toEqual([{ code: "sarif-skipped", detail: "2" }]);
    const [critical, note] = r.doc.findings!;
    expect(critical).toMatchObject({
      severity: "critical",
      rawSeverity: "security-severity 9.8",
      fingerprint: "sarif:codescanner:TST0003:primaryLocationLineHash=abc:1",
      standardRefs: ["CWE:89"],
    });
    expect(note.severity).toBe("low");
  });
});

describe("k6 summary → metrics", () => {
  it.each(["k6/handle-summary.json", "k6/summary-export.json"])(
    "%s matches its snapshot",
    async (sample) => {
      const r = parseReportText(read(sample));
      expect(r.format).toBe("k6");
      await checkAndSnapshot(r, sample.replace("k6/", "k6/normalized/"));
    },
  );

  it("gives the same metrics from handleSummary and --summary-export", () => {
    const strip = (r: ParsedReport) =>
      r.doc.metrics!.map((m) => ({
        ...m,
        attributes: { ...m.attributes, type: undefined },
      }));
    expect(strip(parseReportText(read("k6/summary-export.json")))).toEqual(
      strip(parseReportText(read("k6/handle-summary.json"))),
    );
  });

  it("puts each threshold on its aggregation, failed and passed alike", () => {
    const r = parseReportText(read("k6/summary-export.json"));
    const m = r.doc.metrics!;
    const thresholds = m.filter((x) => x.threshold);
    expect(
      thresholds.map((x) => [
        x.name,
        x.scope ?? "",
        x.aggregation,
        x.threshold,
        x.passed,
      ]),
    ).toEqual([
      ["checks", "", "rate", "rate>0.9", true],
      ["http_req_duration", "case:TC-1", "p95", "p(95)<1500", true],
      [
        "http_req_duration",
        "expected_response:true",
        "p95",
        "p(95)<2000",
        true,
      ],
      ["http_req_failed", "", "rate", "rate<0.0001", false],
    ]);
    // p(99) is not in summaryTrendStats: kept on the metric, with a warning.
    expect(r.warnings).toEqual([
      {
        code: "threshold-without-value",
        detail: "http_req_duration{case:TC-1}: p(99)<3000",
      },
    ]);
    // A case tag from the sub-metric and from a check name.
    expect(m.find((x) => x.scope === "case:TC-1")!.attributes?.tags).toEqual([
      "@TC-1",
    ]);
    expect(
      m.find((x) => x.scope === "::Salud::status es 200 @TC-1")!.attributes
        ?.tags,
    ).toEqual(["@TC-1"]);
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
