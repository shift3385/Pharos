// Result importers (ING-02..05; ADR-0005: Cucumber Messages, CTRF, JUnit
// XML, Playwright JSON, plus Pharos Run JSON itself). The format is detected
// by content, never by extension. Every parser's output goes through
// `parsePharosRun`; the desktop persister (`runs/import.rs`) links and
// stores it. The committed snapshots of the ING-01 samples
// (`fixtures/ing01/normalized/`) are the vectors a later port (INT-01, the
// CLI) must reproduce.

import type * as M from "@cucumber/messages";
import { parsePharosRun } from "../schema.js";
import {
  type ImportDoc,
  type ParsedReport,
  MAX_IMPORT_FINDINGS,
  MAX_IMPORT_METRICS,
  MAX_IMPORT_RESULTS,
  NORMALIZER_VERSION,
  MAX_REPORT_BYTES,
  MAX_WHOLE_REPORT_BYTES,
  ReportError,
  emptyDoc,
  relativizer,
  slashes,
  testKey,
} from "./common.js";
import { isAxeResults, parseAxe } from "./axe.js";
import { fingerprintOf } from "./findings.js";
import { parseCtrf } from "./ctrf.js";
import { isK6Summary, parseK6 } from "./k6.js";
import { isSarif, parseSarif } from "./sarif.js";
import { parseJunit } from "./junit.js";
import { MessagesCollector, parseMessages } from "./messages.js";
import { parsePlaywright } from "./playwright.js";

export * from "./common.js";
export { MessagesCollector, parseMessages } from "./messages.js";
export { type AxeResults, isAxeResults, parseAxe } from "./axe.js";
export * from "./findings.js";
export { type K6Summary, isK6Summary, parseK6 } from "./k6.js";
export { type SarifLog, isSarif, parseSarif } from "./sarif.js";
export { parseCtrf } from "./ctrf.js";
export { parseJunit } from "./junit.js";
export { parsePlaywright } from "./playwright.js";

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
  const rel = relativizer();
  doc.results = doc.results.map((r) => {
    // The file path goes to the synced attributes: relative, like the key.
    if (r.filePath) r = { ...r, filePath: rel(r.filePath) };
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
  // A finding without a fingerprint gets the derived one (ADR-0053): both
  // persisters key findings and their triage by it.
  if (doc.findings?.length) {
    const tool = doc.run.sourceTool ?? "pharos_run_json";
    doc.findings = doc.findings.map((f) =>
      f.fingerprint?.trim()
        ? f
        : {
            ...f,
            fingerprint: fingerprintOf(f, String(f.attributes?.tool ?? tool)),
          },
    );
  }
  if (!doc.shards.length)
    doc.shards = [{ ref: "s1", sourceFormat: "pharos_run_json" }];
  // This normalizer read it (ADR-0013): its version goes with the shard.
  doc.shards = doc.shards.map((s, i) =>
    i === 0 ? { ...s, normalizerVersion: NORMALIZER_VERSION } : s,
  );
  return { format: "pharos_run_json", doc, inline: new Map(), warnings: [] };
}

/** A whole JSON or XML report, by content. */
export function parseReportText(text: string): ParsedReport {
  const body = text.replace(/^\uFEFF/, "").trimStart();
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
    // One axe-core result per page (@axe-core/cli).
    if (json.length > 0 && json.every(isAxeResults)) return parseAxe(json);
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
  if (isAxeResults(o)) return parseAxe(o);
  if (isSarif(o)) return parseSarif(o);
  if (isK6Summary(o)) return parseK6(o);
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
  if ((report.doc.findings?.length ?? 0) > MAX_IMPORT_FINDINGS) {
    throw new ReportError(
      "too-large",
      `at most ${MAX_IMPORT_FINDINGS} findings per import`,
    );
  }
  if ((report.doc.metrics?.length ?? 0) > MAX_IMPORT_METRICS) {
    throw new ReportError(
      "too-large",
      `at most ${MAX_IMPORT_METRICS} metrics per import`,
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
  const first = head
    .replace(/^\uFEFF/, "")
    .trimStart()
    .split(/\r?\n/, 1)[0];
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
