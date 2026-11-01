// Shared pieces of the result importers (ING-02..05, design 0.2.0 §4): each
// parser turns one report format into a Pharos Run JSON document; the desktop
// persister (`src-tauri/src/runs/import.rs`) links, gives ids and stores it.
// The parsers never link to cases: they keep every tag, and the persister
// applies the project's case prefix (ING-01 §5).

import type { PharosRun, PharosRunResult } from "../schema";

export type SourceFormat =
  | "cucumber_messages"
  | "ctrf"
  | "junit"
  | "playwright_json"
  | "pharos_run_json";

export type ResultStatus = PharosRunResult["status"];
/** The document a parser builds: Pharos Run JSON without the parts the four
 *  formats never carry (findings, metrics, sessions). */
export interface ImportDoc {
  schemaVersion: string;
  run: PharosRun["run"];
  shards: PharosRun["shards"];
  results: PharosRunResult[];
  attachments: PharosRun["attachments"];
}
export type ImportResult = PharosRunResult;
export type ImportAttachment = PharosRun["attachments"][number];

/** What a parser gives back. `inline` holds the bytes of the attachments the
 *  report embeds (Messages and Playwright `body`, base64), by `ref`; the
 *  others carry a `path` the user's attachments folder may resolve. */
export interface ParsedReport {
  format: SourceFormat;
  doc: ImportDoc;
  inline: Map<string, InlineBody>;
  warnings: ImportWarning[];
}

export interface InlineBody {
  /** base64, or plain text (Messages `IDENTITY`). */
  data: string;
  encoding: "base64" | "text";
}

/** A warning for the preview; the persister adds the linking ones. */
export interface ImportWarning {
  code: "merged-without-shard" | "no-results" | "attachment-url";
  detail?: string;
}

export class ReportError extends Error {
  constructor(
    public readonly code:
      | "unknown-format"
      | "cucumber-json"
      | "invalid-json"
      | "invalid-xml"
      | "invalid-pharos-run"
      | "too-large"
      | "unsupported-version",
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ReportError";
  }
}

/** Largest report (the raw report is evidence: ADR-0014's 200 MB). NDJSON is
 *  read line by line; JSON and XML are parsed whole, so they stop earlier. */
export const MAX_REPORT_BYTES = 200 * 1024 * 1024;
export const MAX_WHOLE_REPORT_BYTES = 50 * 1024 * 1024;
/** Results per import: one transaction and one call to the desktop. */
export const MAX_IMPORT_RESULTS = 20_000;

/** Separates the path from the title path in a `test_key`. */
export const KEY_SEPARATOR = "::";
/** Joins a title path, as Playwright prints it. */
export const TITLE_SEPARATOR = " › ";

/** `\` → `/`, without `./` or a leading `/` when relative. */
export function slashes(path: string): string {
  return path.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

export const isAbsolute = (p: string) =>
  /^[a-zA-Z]:\//.test(p) || p.startsWith("/") || p.startsWith("//");

/** Relative paths for every path of one report (ING-01 R9): a known root is
 *  stripped first; the absolute paths left lose their common directory, so a
 *  user's home folder never reaches a synced `test_key`. */
export function relativizer(
  paths: Iterable<string>,
  root?: string,
): (path: string) => string {
  const rootN = root ? slashes(root).replace(/\/+$/, "") : undefined;
  const strip = (p: string) => {
    const n = slashes(p);
    if (rootN && n.toLowerCase().startsWith(`${rootN.toLowerCase()}/`))
      return n.slice(rootN.length + 1);
    return n;
  };
  const absolute = [...paths].map(strip).filter(isAbsolute);
  let common: string[] | undefined;
  for (const p of absolute) {
    const dirs = p.split("/").slice(0, -1);
    if (!common) common = dirs;
    else {
      let n = 0;
      while (
        n < common.length &&
        n < dirs.length &&
        common[n].toLowerCase() === dirs[n].toLowerCase()
      )
        n++;
      common = common.slice(0, n);
    }
  }
  const prefix = common && common.length ? `${common.join("/")}/` : undefined;
  return (p) => {
    const n = strip(p);
    if (prefix && n.toLowerCase().startsWith(prefix.toLowerCase()))
      return n.slice(prefix.length);
    return n.replace(/^\/+/, "");
  };
}

/** `test_key` (ADR-0013): normalized path, title path and, when the titles do
 *  not tell rows apart (Cucumber pickles), the 1-based Outline row. */
export function testKey(
  path: string | undefined,
  titles: string[],
  row?: number,
): string {
  const title = titles.filter((t) => t !== "").join(TITLE_SEPARATOR);
  const base = path ? `${path}${KEY_SEPARATOR}${title}` : title;
  return row === undefined ? base : `${base}[${row + 1}]`;
}

/** The Outline row a title names: Playwright/CTRF `Example #n` (1-based,
 *  across the Outline) → 0-based. cucumber-js JUnit `- #b.f` only when b is 1
 *  (the global index needs the block sizes the report does not carry). */
export function rowOfTitle(title: string): number | undefined {
  const pw = /(?:^|\s)Example #(\d+)$/.exec(title);
  if (pw) return Number(pw[1]) - 1;
  const cuc = / - #(\d+)\.(\d+)(?::|$)/.exec(title);
  if (cuc && cuc[1] === "1") return Number(cuc[2]) - 1;
  return undefined;
}

/** `@tag` for a tag written without `@` (Playwright JSON). */
export const atTag = (tag: string) => (tag.startsWith("@") ? tag : `@${tag}`);

/** An epoch-ms number or a text time as ISO 8601 (UTC). */
export function iso(t: number | string | undefined | null): string | undefined {
  if (t === undefined || t === null || t === "") return undefined;
  if (typeof t === "number")
    return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
  return t;
}

/** Worst status first: failed > other > pending > skipped > passed (as
 *  `worst_status` in `runs/derive.rs`, without `blocked`, which only manual
 *  execution writes). */
const RANK: Record<string, number> = {
  failed: 5,
  blocked: 4,
  other: 3,
  pending: 2,
  skipped: 1,
  passed: 0,
};
export function worst(statuses: ResultStatus[]): ResultStatus | undefined {
  let out: ResultStatus | undefined;
  for (const s of statuses)
    if (out === undefined || (RANK[s] ?? 3) > (RANK[out] ?? 3)) out = s;
  return out;
}

/** The kind of evidence an attachment is (retention per kind, ADR-0014). */
export function kindOf(
  name: string,
  contentType?: string,
): ImportAttachment["kind"] {
  const ct = (contentType ?? "").toLowerCase();
  const n = name.toLowerCase();
  if (n === "trace" || n.endsWith(".zip") || ct === "application/zip")
    return "trace";
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("image/")) return "screenshot";
  if (ct.startsWith("text/plain") || n.endsWith(".log")) return "log";
  return "evidence";
}

/** Requirement-like tags are informative (ING-01 §3); the persister matches
 *  case tags itself. Here only the tag list is cleaned. */
export function uniqueTags(tags: Iterable<string>): string[] {
  return [...new Set([...tags].map((t) => t.trim()).filter(Boolean))];
}

export function emptyDoc(format: SourceFormat): ImportDoc {
  return {
    schemaVersion: "1.0.0",
    run: { trigger: "import" },
    shards: [{ ref: "s1", sourceFormat: format }],
    results: [],
    attachments: [],
  };
}

/** Attachment refs of a document, in order: `a1`, `a2`, … */
export function refMaker(): () => string {
  let n = 0;
  return () => `a${++n}`;
}

/** `{n}-of-{m}` / `{n}/{m}` → shard index and total. */
export function shardOf(
  text: string | undefined | null,
): { shardIndex: number; shardTotal: number } | undefined {
  const m = /^\s*(\d+)\s*(?:-of-|\/|of)\s*(\d+)\s*$/i.exec(text ?? "");
  if (!m) return undefined;
  const shardIndex = Number(m[1]);
  const shardTotal = Number(m[2]);
  return shardTotal > 0 && shardIndex >= 1 && shardIndex <= shardTotal
    ? { shardIndex, shardTotal }
    : undefined;
}
