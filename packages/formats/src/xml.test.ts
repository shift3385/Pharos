import { describe, expect, it } from "vitest";
import { parseReportText } from "./importers/index.js";
import { prologHasDoctype } from "./xml.js";

// XXE and entity bombs reach a parser through a DTD; no result format needs
// one, so every XML report with a DTD is refused, whatever DOMParser parses
// it (ADR-0053). The server repeats these cases with @xmldom/xmldom.
const XXE = `<?xml version="1.0"?>
<!DOCTYPE testsuites [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<testsuites><testsuite name="s"><testcase classname="c" name="&xxe;"/></testsuite></testsuites>`;

const BOMB = `<?xml version="1.0"?>
<!-- a comment before the DTD does not hide it -->
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
]>
<testsuites><testsuite name="&lol2;"/></testsuites>`;

const HTML_IN_OUTPUT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites><testsuite name="s" tests="1">
<testcase classname="page.spec.ts" name="renders" time="0.1">
<system-out><![CDATA[<!DOCTYPE html><html><body>ok</body></html>]]></system-out>
</testcase></testsuite></testsuites>`;

describe("XML reports refuse a DTD (XXE, entity bombs)", () => {
  it.each([
    ["an external entity", XXE],
    ["an entity bomb after a comment", BOMB],
  ])("refuses %s as invalid-xml: doctype", (_, text) => {
    expect(() => parseReportText(text)).toThrow(
      expect.objectContaining({
        code: "invalid-xml",
        message: "invalid-xml: doctype",
      }),
    );
  });

  it("reads only the prolog: a DOCTYPE inside captured output is content", () => {
    expect(prologHasDoctype(HTML_IN_OUTPUT)).toBe(false);
    const r = parseReportText(HTML_IN_OUTPUT);
    expect(r.doc.results).toHaveLength(1);
    expect(r.doc.results[0].status).toBe("passed");
  });

  it("finds the DOCTYPE after a BOM, the declaration and comments", () => {
    expect(
      prologHasDoctype("\uFEFF<?xml version='1.0'?>\n<!--x--><!doctype a><a/>"),
    ).toBe(true);
    expect(prologHasDoctype("<a><!DOCTYPE b></a>")).toBe(false);
  });
});
