// Reading an uploaded report (INT-02 A2, ADR-0052 §2): the bytes the API
// received, decompressed within limits and converted to Pharos Run JSON by
// the shared parsers (`@pharos/formats`, track F). Nothing here writes.
//
// - **Size:** the body has a compressed limit (`API_UPLOAD_LIMIT_BYTES`, the
//   route's `bodyLimit`) and gzip is inflated with a hard ceiling
//   (`maxOutputLength`), so a gzip bomb stops at the ceiling.
// - **XML:** the package refuses any DTD (`<!DOCTYPE`, `<!ENTITY`) before the
//   parser sees it: no external entities (XXE), no entity expansion.
// - **Time:** parsing is synchronous CPU work, so a timer cannot interrupt it
//   in-process; the server parses in a child process killed at the deadline
//   (`processParser`). Tests inject the in-process parser.
// - **Errors:** an unreadable report answers 422 `invalid_report` with the
//   format and a generic reason, never a piece of the file.
import { gunzipSync } from "node:zlib";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AppError } from "../auth/errors.js";

/** What a parse gives back: the format it detected and the document. */
export interface ParsedUpload {
  format: string;
  doc: Record<string, unknown>;
  warnings: { code: string; detail?: string }[];
  /** Bytes the report embeds (Messages, Playwright), by attachment ref. */
  inline: { ref: string; data: string; encoding: "base64" | "text" }[];
}

/** A byte-order mark (U+FEFF) before a document is not part of it. */
const BOM = String.fromCharCode(0xfeff);

export type ReportParser = (text: string) => Promise<ParsedUpload>;

/** Formats `?format=` accepts. `allure` and `trx` come with track F (F6). */
export const UPLOAD_FORMATS = [
  "pharos_run_json",
  "junit",
  "ctrf",
  "playwright_json",
  "cucumber_messages",
  "sarif",
  "axe",
  "k6",
  "allure",
  "trx",
] as const;
export type UploadFormat = (typeof UPLOAD_FORMATS)[number];
const NOT_YET: readonly string[] = ["allure", "trx"];

export const UploadErrors = {
  unsupported: (format: string) =>
    new AppError(422, "unsupported_format", `This server does not import ${format} reports yet.`, { format }),
  mismatch: (expected: string, detected: string) =>
    new AppError(400, "format_mismatch", `The file is ${detected}, not ${expected}.`, { expected, detected }),
  invalid: (reason: string, format?: string) =>
    new AppError(422, "invalid_report", "The report could not be read.", { reason, ...(format ? { format } : {}) }),
  timeout: (seconds: number) =>
    new AppError(422, "report_timeout", `Reading the report took more than ${seconds} s.`, { seconds }),
  tooLarge: (max: number) =>
    new AppError(413, "payload_too_large", `The report is larger than ${max} bytes once decompressed.`, { max }),
  encoding: () => new AppError(415, "unsupported_media_type", "Content-Encoding must be gzip or none."),
  empty: () => new AppError(400, "validation_error", "The request has no report in its body."),
};

/** The body as the file's bytes: inflated if gzip, within `maxBytes`. */
export function inflate(body: Buffer, encoding: string | undefined, maxBytes: number): Buffer {
  if (body.length === 0) throw UploadErrors.empty();
  const enc = (encoding ?? "").trim().toLowerCase();
  if (enc === "" || enc === "identity") {
    if (body.length > maxBytes) throw UploadErrors.tooLarge(maxBytes);
    return body;
  }
  if (enc !== "gzip") throw UploadErrors.encoding();
  try {
    return gunzipSync(body, { maxOutputLength: maxBytes });
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" || e instanceof RangeError) throw UploadErrors.tooLarge(maxBytes);
    throw UploadErrors.invalid("gzip");
  }
}

/** The `ReportError` code of a parser failure, without its detail (which may
 *  quote the file): `invalid-xml` with `doctype` keeps that word only. */
export function reasonOf(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  const message = e instanceof Error ? e.message : "";
  if (code === "invalid-xml" && /doctype/i.test(message)) return "doctype";
  return typeof code === "string" && /^[a-z-]+$/.test(code) ? code : "unreadable";
}

/** Reads `text` with the shared parsers, in this thread. */
export async function inProcessParser(text: string): Promise<ParsedUpload> {
  const formats = await import("@pharos/formats");
  const { DOMParser } = await import("@xmldom/xmldom");
  formats.configureXml(DOMParser as never);
  const body = (text.startsWith(BOM) ? text.slice(1) : text).trimStart();
  let parsed;
  // A Pharos Run JSON document goes through its own validator (the generic
  // reader takes CTRF-shaped JSON too).
  if (body.startsWith("{")) {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      json = undefined;
    }
    const v = json && typeof json === "object" ? (json as Record<string, unknown>).schemaVersion : undefined;
    parsed = typeof v === "string" ? formats.parsePharosRunFile(json) : formats.parseReportText(text);
  } else {
    parsed = formats.parseReportText(text);
  }
  return {
    format: parsed.format,
    doc: parsed.doc as unknown as Record<string, unknown>,
    warnings: parsed.warnings,
    inline: [...parsed.inline.entries()].map(([ref, b]) => ({ ref, data: b.data, encoding: b.encoding })),
  };
}

/** A parser that reads each report in a child process, killed after
 *  `timeoutMs`. A child process rather than a worker thread: under tsx a
 *  worker does not resolve the TypeScript imports (Node 24), a child process
 *  does. It costs a process start per upload, which CI uploads afford. */
export function processParser(timeoutMs: number): ReportParser {
  const script = fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "./reportWorker.ts" : "./reportWorker.js", import.meta.url));
  return (text) =>
    new Promise<ParsedUpload>((resolve, reject) => {
      const child = fork(script, [], { execArgv: process.execArgv, serialization: "advanced", stdio: ["ignore", "ignore", "ignore", "ipc"] });
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill();
        fn();
      };
      const timer = setTimeout(() => done(() => reject(UploadErrors.timeout(Math.round(timeoutMs / 1000)))), timeoutMs);
      child.once("message", (m: { ok: true; value: ParsedUpload } | { ok: false; reason: string }) =>
        done(() => (m.ok ? resolve(m.value) : reject(UploadErrors.invalid(m.reason)))),
      );
      child.once("error", () => done(() => reject(UploadErrors.invalid("unreadable"))));
      child.once("exit", () => done(() => reject(UploadErrors.invalid("unreadable"))));
      child.send(text);
    });
}

/** Parses, then checks the format the caller named against the one found. */
export async function parseUpload(parser: ReportParser, file: Buffer, expected: string | undefined): Promise<ParsedUpload> {
  if (expected && !(UPLOAD_FORMATS as readonly string[]).includes(expected)) throw UploadErrors.unsupported(expected);
  if (expected && NOT_YET.includes(expected)) throw UploadErrors.unsupported(expected);
  let parsed: ParsedUpload;
  try {
    parsed = await parser(file.toString("utf8"));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw UploadErrors.invalid(reasonOf(e), expected);
  }
  if (expected && parsed.format !== expected) throw UploadErrors.mismatch(expected, parsed.format);
  return parsed;
}
