// Result importers (ING-02..05; ADR-0005: Cucumber Messages, CTRF, JUnit
// XML, Playwright JSON, plus Pharos Run JSON itself). The format is detected
// by content, never by extension. Every parser's output goes through
// `parsePharosRun`; the desktop persister (`runs/import.rs`) links and
// stores it. The committed snapshots of the ING-01 samples
// (`fixtures/ing01/normalized/`) are the vectors a later port (INT-01, the
// CLI) must reproduce.

import type * as M from "@cucumber/messages";
import { parsePharosRun } from "../schema";
import {
  type ImportDoc,
  type ParsedReport,
  MAX_IMPORT_RESULTS,
  MAX_REPORT_BYTES,
  MAX_WHOLE_REPORT_BYTES,
  ReportError,
  emptyDoc,
  relativizer,
  slashes,
  testKey,
} from "./common";
import { parseCtrf } from "./ctrf";
import { parseJunit } from "./junit";
import { MessagesCollector, parseMessages } from "./messages";
import { parsePlaywright } from "./playwright";

export * from "./common";
export { MessagesCollector, parseMessages } from "./messages";
export { parseCtrf } from "./ctrf";
export { parseJunit } from "./junit";
export { parsePlaywright } from "./playwright";

const ENVELOPE_KEYS = new Set([
  "meta",
  "source",
  "gherkinDocument",
  "pickle",
  "stepDefinition",
  "hook",
  "parameterType",
  "testRunStarted",
  "testCase",
  "testCaseStarted",
  "testStepStarted",
  "testStepFinished",
  "testCaseFinished",
  "attachment",
  "testRunFinished",
  "undefinedParameterType",
]);

/** True for a Messages envelope (one key, a known one). */
function isEnvelope(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length === 1 && ENVELOPE_KEYS.has(keys[0]);
}

/** Pharos Run JSON as a file: validated, and a missing `testKey` derived from
 *  `filePath`/`suite`/`name` as the other formats do. */
export function parsePharosRunFile(input: unknown): ParsedReport {
  const parsed = parsePharosRun(input);
  if (!parsed.ok) {
    throw new ReportError(
      "invalid-pharos-run",
      parsed.issues
        .slice(0, 5)
        .map((i) => `${i.path}: ${i.message}`)
        .join("; "),
    );
  }
  const doc = parsed.value as ImportDoc;
  const rel = relativizer(
    doc.results.flatMap((r) => (r.filePath ? [r.filePath] : [])),
  );
  doc.results = doc.results.map((r) => {
    if (r.testKey) return r;
    const suite = Array.isArray(r.suite) ? r.suite : r.suite ? [r.suite] : [];
    return {
      ...r,
      testKey: testKey(r.filePath ? rel(slashes(r.filePath)) : undefined, [
        ...suite,
        r.name,
      ]),
    };
  });
  if (!doc.shards.length)
    doc.shards = [{ ref: "s1", sourceFormat: "pharos_run_json" }];
  return { format: "pharos_run_json", doc, inline: new Map(), warnings: [] };
}

/** A whole JSON or XML report, by content. */
export function parseReportText(text: string): ParsedReport {
  const body = text.replace(/^FEFF/, "").trimStart();
  if (body.startsWith("<")) return checked(parseJunit(body));
  const firstLine = body.split(/\r?\n/, 1)[0];
  try {
    if (isEnvelope(JSON.parse(firstLine))) return checked(parseMessages(body));
  } catch {
    // Not one JSON value per line: a whole JSON document.
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (e) {
    throw new ReportError(
      "invalid-json",
      e instanceof Error ? e.message : undefined,
    );
  }
  return checked(parseJson(json));
}

function parseJson(json: unknown): ParsedReport {
  if (Array.isArray(json)) {
    // Cucumber JSON (features with `elements`): out of scope (ADR-0005).
    if (
      json.length === 0 ||
      (typeof json[0] === "object" && json[0] && "elements" in json[0])
    ) {
      throw new ReportError("cucumber-json");
    }
    throw new ReportError("unknown-format");
  }
  const o = (json ?? {}) as Record<string, unknown>;
  if (o.reportFormat === "CTRF" && o.results)
    return parseCtrf(o as unknown as Parameters<typeof parseCtrf>[0]);
  if (typeof o.schemaVersion === "string") return parsePharosRunFile(o);
  if (o.config && Array.isArray(o.suites))
    return parsePlaywright(
      o as unknown as Parameters<typeof parsePlaywright>[0],
    );
  throw new ReportError("unknown-format");
}

/** The parse result, validated and within the per-import limits. */
function checked(report: ParsedReport): ParsedReport {
  if (report.doc.results.length > MAX_IMPORT_RESULTS) {
    throw new ReportError(
      "too-large",
      `at most ${MAX_IMPORT_RESULTS} results per import`,
    );
  }
  if (report.format !== "pharos_run_json") {
    const v = parsePharosRun(report.doc);
    if (!v.ok) {
      throw new ReportError(
        "invalid-pharos-run",
        v.issues.map((i) => `${i.path}: ${i.message}`).join("; "),
      );
    }
  }
  // A merged report lost its shard (ING-01 §4): imported anyway, with a note.
  if (
    (report.doc.run.context as Record<string, unknown> | undefined)?.merged ===
    true
  ) {
    report.warnings.push({ code: "merged-without-shard" });
  }
  return report;
}

/** A report from a file: NDJSON is read line by line (bounded memory, up to
 *  the 200 MB evidence limit); JSON and XML are parsed whole (50 MB). */
export async function parseReportFile(file: Blob): Promise<ParsedReport> {
  if (file.size > MAX_REPORT_BYTES)
    throw new ReportError("too-large", `${MAX_REPORT_BYTES} bytes`);
  const head = await file.slice(0, 64 * 1024).text();
  const first = head.replace(/^FEFF/, "").trimStart().split(/\r?\n/, 1)[0];
  let ndjson = false;
  try {
    ndjson = isEnvelope(JSON.parse(first));
  } catch {
    ndjson = false;
  }
  if (!ndjson) {
    if (file.size > MAX_WHOLE_REPORT_BYTES)
      throw new ReportError("too-large", `${MAX_WHOLE_REPORT_BYTES} bytes`);
    return parseReportText(await file.text());
  }
  const c = new MessagesCollector();
  for await (const line of lines(file)) {
    const t = line.trim();
    if (t) c.push(JSON.parse(t) as M.Envelope);
  }
  return checked(c.finish());
}

async function* lines(file: Blob): AsyncGenerator<string> {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let rest = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    rest += value;
    let n: number;
    while ((n = rest.indexOf("\n")) >= 0) {
      yield rest.slice(0, n);
      rest = rest.slice(n + 1);
    }
  }
  if (rest) yield rest;
}

/** An empty document of a format (tests). */
export const emptyReport = emptyDoc;
