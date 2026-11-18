// The shared importers (`@pharos/formats`, ADR-0053) run in Node with
// `@xmldom/xmldom` and produce byte for byte the snapshots the app's tests
// (jsdom's DOMParser) produce: the server's API upload (INT-02) parses
// exactly like the desktop.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "@xmldom/xmldom";
import { beforeAll, describe, expect, it } from "vitest";
import {
  configureXml,
  parsePharosRun,
  parseReportText,
  type ParsedReport,
} from "@pharos/formats";

const DIR = fileURLToPath(
  new URL("../../packages/formats/src/fixtures/ing01/", import.meta.url),
);

const SAMPLES = [
  "single/cucumber-messages.ndjson",
  "single/ctrf.json",
  "single/pw.json",
  "single/pw-junit.xml",
  "single/cucumber-junit.xml",
  "shard1/pw-junit.xml",
  "shard2/pw-junit.xml",
  "merged/pw-junit.xml",
  "merged/cucumber-messages.ndjson",
  "ann/pw-junit.xml",
  "cuc/junit.xml",
];

// The same projection as packages/formats/src/importers/importers.test.ts.
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

beforeAll(() => configureXml(DOMParser));

describe("@pharos/formats in Node", () => {
  it.each(SAMPLES)("%s matches the app's snapshot", (sample) => {
    const r = parseReportText(readFileSync(join(DIR, sample), "utf8"));
    expect(parsePharosRun(r.doc).ok).toBe(true);
    const expected = readFileSync(
      join(DIR, "normalized", `${sample.replaceAll("/", "__")}.json`),
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(snapshot(r)).toBe(expected);
  });

  it.each([
    [
      "an external entity (XXE)",
      '<?xml version="1.0"?><!DOCTYPE t [<!ENTITY x SYSTEM "file:///etc/passwd">]><testsuites><testsuite name="&x;"/></testsuites>',
    ],
    [
      "an entity bomb",
      '<!DOCTYPE l [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><testsuites><testsuite name="&b;"/></testsuites>',
    ],
  ])("refuses %s before xmldom sees it", (_, text) => {
    expect(() => parseReportText(text)).toThrow(
      expect.objectContaining({
        code: "invalid-xml",
        message: "invalid-xml: doctype",
      }),
    );
  });

  it("refuses malformed XML as invalid-xml", () => {
    expect(() =>
      parseReportText("<testsuites><testsuite></testsuites>"),
    ).toThrow(expect.objectContaining({ code: "invalid-xml" }));
  });
});
