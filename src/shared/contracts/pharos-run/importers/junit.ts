// JUnit XML (Playwright, cucumber-js, Surefire, pytest…) → Pharos Run JSON
// (ING-01 §2.1, §2.2, §3). JUnit carries no tags (ING-01 conclusion 1): a
// test only links with the `test_id` property of the spike's recipe (the
// TestRail convention); everything else goes to the tray. Flaky and rerun
// elements (`flakyFailure`/`flakyError`, `rerunFailure`/`rerunError`: Surefire
// and Playwright `includeRetries`) become earlier failed attempts.
// Parsed with the webview's DOMParser: no XML dependency.

import {
  type ImportAttachment,
  type ImportResult,
  type ParsedReport,
  type ResultStatus,
  ReportError,
  atTag,
  emptyDoc,
  iso,
  kindOf,
  refMaker,
  relativizer,
  rowOfTitle,
  slashes,
  testKey,
  uniqueTags,
} from "./common";

const RETRIES = ["flakyFailure", "flakyError", "rerunFailure", "rerunError"];
const ATTACHMENT = /\[\[ATTACHMENT\|([^\]]+)\]\]/g;

const children = (el: Element, name?: string) =>
  Array.from(el.children).filter(
    (c) => name === undefined || c.localName === name,
  );
const seconds = (v: string | null) => {
  const n = v === null ? NaN : Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : undefined;
};

export function parseJunit(text: string): ParsedReport {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.getElementsByTagName("parsererror").length)
    throw new ReportError("invalid-xml");
  const root = xml.documentElement;
  if (root.localName !== "testsuites" && root.localName !== "testsuite")
    throw new ReportError("unknown-format");
  const doc = emptyDoc("junit");
  const nextRef = refMaker();

  // Every testcase with the suite chain around it.
  const cases: { el: Element; suites: Element[] }[] = [];
  const walk = (el: Element, suites: Element[]) => {
    for (const c of children(el)) {
      if (c.localName === "testsuite") walk(c, [...suites, c]);
      else if (c.localName === "testcase") cases.push({ el: c, suites });
    }
  };
  if (root.localName === "testsuite") walk(root, [root]);
  else walk(root, []);

  const stamps = Array.from(xml.getElementsByTagName("testsuite"))
    .map((s) => s.getAttribute("timestamp"))
    .filter((t): t is string => !!t)
    .sort();
  doc.run = {
    trigger: "import",
    sourceTool: root.getAttribute("name") || undefined,
    startedAt: iso(stamps[0]),
    context: {},
  };
  const pathOf = (c: { el: Element; suites: Element[] }) =>
    c.el.getAttribute("classname") ||
    c.el.getAttribute("file") ||
    c.suites[c.suites.length - 1]?.getAttribute("name") ||
    "";
  const rel = relativizer();

  for (const c of cases) {
    const el = c.el;
    const name = el.getAttribute("name") ?? "";
    const rawPath = pathOf(c);
    // A classname that is a path is relativized; a Java/Cucumber class name
    // (`com.acme.LoginTest`, `Autenticacion`) is kept as it is.
    const path = /[\\/]/.test(rawPath) ? rel(slashes(rawPath)) : rawPath;
    const props = new Map<string, string[]>();
    for (const p of el.querySelectorAll(":scope > properties > property")) {
      const k = p.getAttribute("name") ?? "";
      const v = p.getAttribute("value") ?? p.textContent ?? "";
      props.set(k, [...(props.get(k) ?? []), v]);
    }
    const tags = uniqueTags([
      ...(props.get("test_id") ?? []).map(atTag),
      ...[...(props.get("tag") ?? []), ...(props.get("tags") ?? [])]
        .flatMap((v) => v.split(/[\s,]+/))
        .map(atTag),
    ]);
    const requirementKeys = props.get("requirement");
    const out = [...children(el, "system-out"), ...children(el, "system-err")]
      .map((s) => s.textContent ?? "")
      .join("\n");
    const refs: string[] = [];
    for (const m of out.matchAll(ATTACHMENT)) {
      const p = m[1].trim();
      const ref = nextRef();
      const fileName = p.split(/[\\/]/).pop() || "attachment";
      const att: ImportAttachment = {
        ref,
        name: fileName,
        kind: kindOf(fileName),
        path: p,
      };
      doc.attachments.push(att);
      refs.push(ref);
    }
    const fail = children(el).find(
      (x) => x.localName === "failure" || x.localName === "error",
    );
    const skipped = children(el, "skipped")[0];
    const retries = children(el).filter((x) => RETRIES.includes(x.localName));
    const key = testKey(path || undefined, [name]);
    const row = rowOfTitle(name);
    const base = {
      name,
      testKey: key,
      ...(path && /[\\/]/.test(rawPath) ? { filePath: path } : {}),
      ...(path ? { suite: [path] } : {}),
      tags,
      ...(row !== undefined ? { exampleRow: row } : {}),
      shardRef: "s1",
    };
    const messageOf = (x: Element) => x.getAttribute("message") || undefined;
    const traceOf = (x: Element) => (x.textContent ?? "").trim() || undefined;
    // A test that failed after reruns: in Surefire the <failure> is the
    // first run and each <rerunFailure>/<rerunError> a later one, so the
    // last rerun is the final attempt. Flaky elements precede a pass.
    const reruns = retries.filter((r) => r.localName.startsWith("rerun"));
    const runs =
      fail && reruns.length
        ? [fail, ...reruns]
        : [...retries, ...(fail ? [fail] : [])];
    const last = fail ? runs[runs.length - 1] : undefined;
    const earlier = fail ? runs.slice(0, -1) : retries;
    earlier.forEach((r, i) => {
      doc.results.push({
        ...base,
        status: "failed",
        rawStatus: r.localName,
        attempt: i,
        ...(seconds(r.getAttribute("time")) !== undefined
          ? { duration: seconds(r.getAttribute("time")) }
          : {}),
        ...(messageOf(r) ? { message: messageOf(r) } : {}),
        ...(traceOf(r) ? { trace: traceOf(r) } : {}),
      } as ImportResult);
    });
    const status: ResultStatus = fail
      ? "failed"
      : skipped
        ? "skipped"
        : "passed";
    const flaky = retries.some((r) => r.localName.startsWith("flaky")) && !fail;
    const attributes: Record<string, unknown> = {};
    if (flaky) attributes.flaky = true;
    if (requirementKeys?.length) attributes.requirementKeys = requirementKeys;
    const other = [...props].filter(
      ([k]) => !["test_id", "requirement", "tag", "tags"].includes(k),
    );
    if (other.length)
      attributes.properties = Object.fromEntries(
        other.map(([k, v]) => [k, v.length === 1 ? v[0] : v]),
      );
    doc.results.push({
      ...base,
      status,
      rawStatus: last?.localName ?? (skipped ? "skipped" : "passed"),
      attempt: earlier.length,
      ...(seconds(el.getAttribute("time")) !== undefined
        ? { duration: seconds(el.getAttribute("time")) }
        : {}),
      ...(last && messageOf(last) ? { message: messageOf(last) } : {}),
      ...(last && traceOf(last) ? { trace: traceOf(last) } : {}),
      ...(skipped && messageOf(skipped) ? { message: messageOf(skipped) } : {}),
      ...(refs.length ? { attachments: refs } : {}),
      attributes,
    } as ImportResult);
  }
  return {
    format: "junit",
    doc,
    inline: new Map(),
    warnings: doc.results.length ? [] : [{ code: "no-results" }],
  };
}
