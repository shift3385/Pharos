// TRX (VSTest: `dotnet test --logger trx`, MSTest, xUnit, NUnit) → Pharos
// Run JSON (ING-07, plan F §7.5). A `<TestRun>` in the TeamTest/2010
// namespace: `Results/UnitTestResult` are the executions and
// `TestDefinitions/UnitTest` the tests (class, method, categories). Parsed
// with the injected XML parser (`../xml`), as JUnit.
//
// - Key: the class (`.` → `/`) and the result's name without the class
//   prefix xUnit writes; without a class, the test storage (relativized).
// - Several results of one test (`testId`: retries by an external tool) are
//   attempts by start time; the last one is final.
// - `InnerResults` (data-driven: MSTest `DataRow`, xUnit `Theory`) are rows.
// - `[TestCategory("TC-12")]` (NUnit `[Category]`, xUnit trait `Category`)
//   is a tag, so it links to the case.

import {
  type ImportAttachment,
  type ImportResult,
  type ParsedReport,
  type ResultStatus,
  ReportError,
  atTag,
  emptyDoc,
  kindOf,
  refMaker,
  slashes,
  testKey,
  uniqueTags,
} from "./common.js";
import { type XmlDocument, type XmlElement, XML_DOCTYPE, elements, xmlParser } from "../xml.js";

/** The namespace of a TRX document. */
export const TRX_NAMESPACE = "http://microsoft.com/schemas/VisualStudio/TeamTest/2010";

/** True when a text is a TRX document (its root element, after the prolog). */
export function isTrx(text: string): boolean {
  const head = text.replace(/^\uFEFF/, "").slice(0, 4096);
  return /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<TestRun[\s>]/.test(head);
}

const STATUS: Record<string, ResultStatus> = {
  passed: "passed",
  failed: "failed",
  error: "failed",
  timeout: "failed",
  aborted: "failed",
  notexecuted: "skipped",
};

/** `hh:mm:ss.fffffff` (a day may lead: `d.hh:mm:ss`) → milliseconds. */
export function trxDuration(v: string | null): number | undefined {
  const m = /^(?:(\d+)\.)?(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec((v ?? "").trim());
  if (!m) return undefined;
  const ms = ((Number(m[1] ?? 0) * 24 + Number(m[2])) * 60 + Number(m[3])) * 60_000 + Number(m[4]) * 1000;
  return Number.isFinite(ms) ? Math.round(ms) : undefined;
}

/** The test framework of a test: its VSTest adapter (`executor://xunit/…`
 *  → `xunit`) or, when the adapter is an id (xUnit v3), its assembly name. */
function toolOf(adapter: string | null, storage: string): string | undefined {
  const known = (s: string) =>
    /mstest/i.test(s) ? "mstest" : /nunit/i.test(s) ? "nunit" : /xunit/i.test(s) ? "xunit" : undefined;
  const m = /^executor:\/\/([^/]+)/i.exec(adapter ?? "");
  return (m ? known(m[1]) : undefined) ?? known(assemblyOf(storage));
}

/** The file name of a test assembly path (never the machine's path). */
const assemblyOf = (storage: string) => slashes(storage).split("/").pop() ?? "";

interface Definition {
  className: string;
  storage: string;
  tags: string[];
  adapter: string | null;
}

export function parseTrx(text: string): ParsedReport {
  let xml: XmlDocument;
  try {
    xml = xmlParser()(text);
  } catch (e) {
    throw new ReportError("invalid-xml", e instanceof Error && e.message === XML_DOCTYPE ? XML_DOCTYPE : undefined);
  }
  if (!xml.documentElement || xml.getElementsByTagName("parsererror").length) throw new ReportError("invalid-xml");
  const root = xml.documentElement;
  if (root.localName !== "TestRun") throw new ReportError("unknown-format");
  const doc = emptyDoc("trx");
  const nextRef = refMaker();
  const child = (el: XmlElement, name: string) => elements(el, name)[0];

  // The tests, by id.
  const defs = new Map<string, Definition>();
  for (const block of elements(root, "TestDefinitions"))
    for (const ut of elements(block, "UnitTest")) {
      const method = child(ut, "TestMethod");
      const tags = elements(ut, "TestCategory")
        .flatMap((c) => elements(c, "TestCategoryItem"))
        .map((i) => atTag((i.getAttribute("TestCategory") ?? "").trim()))
        .filter((t) => t !== "@");
      defs.set(ut.getAttribute("id") ?? "", {
        className: method?.getAttribute("className") ?? "",
        storage: ut.getAttribute("storage") ?? "",
        tags: uniqueTags(tags),
        adapter: method?.getAttribute("adapterTypeName") ?? null,
      });
    }

  const times = child(root, "Times");
  const tool = [...defs.values()].map((d) => toolOf(d.adapter, d.storage)).find(Boolean);
  const context: Record<string, unknown> = {};
  const runName = root.getAttribute("name");
  if (runName) context.runName = runName;
  if (times?.getAttribute("finish")) context.finishedAt = times.getAttribute("finish");
  doc.run = {
    trigger: "import",
    sourceTool: tool ?? "vstest",
    startedAt: times?.getAttribute("start") || undefined,
    context,
  };

  interface Exec {
    el: XmlElement;
    testId: string;
    start: string;
  }
  const results = elements(root, "Results").flatMap((r) => elements(r, "UnitTestResult"));
  const byTest = new Map<string, Exec[]>();
  for (const el of results) {
    const testId = el.getAttribute("testId") ?? "";
    const list = byTest.get(testId) ?? [];
    list.push({ el, testId, start: el.getAttribute("startTime") ?? "" });
    byTest.set(testId, list);
  }

  const messageOf = (el: XmlElement) => {
    const info = elements(el, "Output").flatMap((o) => elements(o, "ErrorInfo"))[0];
    const message = info ? (child(info, "Message")?.textContent ?? "").trim() : "";
    const trace = info ? (child(info, "StackTrace")?.textContent ?? "").trim() : "";
    return { ...(message ? { message } : {}), ...(trace ? { trace } : {}) };
  };
  const attachmentsOf = (el: XmlElement): string[] => {
    const dir = el.getAttribute("relativeResultsDirectory");
    const refs: string[] = [];
    for (const f of elements(el, "ResultFiles").flatMap((r) => elements(r, "ResultFile"))) {
      const p = slashes(f.getAttribute("path") ?? "").trim();
      if (!p) continue;
      const ref = nextRef();
      const name = p.split("/").pop() || "attachment";
      const att: ImportAttachment = { ref, name, kind: kindOf(name), path: dir ? `${dir}/${p}` : p };
      doc.attachments.push(att);
      refs.push(ref);
    }
    return refs;
  };
  const resultOf = (el: XmlElement, def: Definition | undefined, title: string, attempt: number, row?: number) => {
    const raw = el.getAttribute("outcome") ?? "";
    const status = STATUS[raw.toLowerCase()] ?? "other";
    // Without a class, the test assembly by name.
    const path = def?.className ? def.className.replace(/\./g, "/") : assemblyOf(def?.storage ?? "");
    const duration = trxDuration(el.getAttribute("duration"));
    const refs = attachmentsOf(el);
    const attributes: Record<string, unknown> = {};
    if (row !== undefined && el.getAttribute("testName")) attributes.dataRow = el.getAttribute("testName");
    const r: ImportResult = {
      name: title,
      testKey: testKey(path || undefined, [title], row),
      ...(path ? { suite: [def?.className || path] } : {}),
      tags: def?.tags ?? [],
      ...(row !== undefined ? { exampleRow: row } : {}),
      status,
      rawStatus: raw,
      attempt,
      ...(el.getAttribute("startTime") ? { startedAt: el.getAttribute("startTime")! } : {}),
      ...(el.getAttribute("endTime") ? { finishedAt: el.getAttribute("endTime")! } : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...messageOf(el),
      ...(refs.length ? { attachments: refs } : {}),
      shardRef: "s1",
      attributes,
    } as ImportResult;
    return r;
  };

  for (const [testId, execs] of byTest) {
    const def = defs.get(testId);
    execs.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    execs.forEach((x, attempt) => {
      const name = x.el.getAttribute("testName") ?? "";
      // xUnit names a test by its full name: the class is already the path.
      const prefix = def?.className ? `${def.className}.` : "";
      const title = prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name;
      const inner = elements(x.el, "InnerResults").flatMap((i) => elements(i, "UnitTestResult"));
      if (inner.length) inner.forEach((el, row) => doc.results.push(resultOf(el, def, title, attempt, row)));
      else doc.results.push(resultOf(x.el, def, title, attempt));
    });
  }
  return {
    format: "trx",
    doc,
    inline: new Map(),
    warnings: doc.results.length ? [] : [{ code: "no-results" }],
  };
}
