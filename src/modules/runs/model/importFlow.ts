// The import of a test report (ING-02..05, design 0.2.0 §4): read and parse
// the file here (the parsers are TypeScript), let the desktop link and store
// it (`runs/import.rs`), then send the report's attachments one at a time.

import {
  type ImportAttachment,
  type InlineBody,
  type ParsedReport,
  parseReportFile,
  slashes,
} from "@shared/contracts/pharos-run/importers";
import type {
  ImportNewRun,
  ReportImportOutcome,
  ReportImportRequest,
} from "@shared/contracts/contract";
import { runsApi } from "../api/runsApi";
import { sha256OfBlob } from "./sha256";

export interface ReadReport {
  file: File;
  parsed: ParsedReport;
  /** sha256 of the file (hex): the shard's identity (ADR-0013). */
  sha256: string;
}

/** Parses a report and hashes it. */
export async function readReport(file: File): Promise<ReadReport> {
  const parsed = await parseReportFile(file);
  // Hashed as a stream: a 200 MB report is never whole in memory for it.
  const sha256 = await sha256OfBlob(file);
  return { file, parsed, sha256 };
}

/** Where the import goes: a new run (with what the user typed) or an open one. */
export type ImportTarget =
  { kind: "new"; run: ImportNewRun } | { kind: "existing"; runId: string };

export function buildRequest(
  projectId: string,
  userId: string,
  report: ReadReport,
  target: ImportTarget,
  allowDuplicate = false,
): ReportImportRequest {
  return {
    projectId,
    userId,
    ...(target.kind === "new"
      ? { newRun: target.run }
      : { runId: target.runId }),
    doc: report.parsed.doc as unknown as Record<string, unknown>,
    sha256: report.sha256,
    fileName: report.file.name,
    ...(allowDuplicate ? { allowDuplicate: true } : {}),
  };
}

/** The file of `folder` an attachment path names: the one whose relative
 *  path ends with the most segments of it (at least the file name). Reports
 *  carry the path of the machine that ran the tests (absolute, `..\..\`), so
 *  only its tail can match the folder the user picked. */
export function matchAttachment(
  path: string,
  folder: readonly File[],
): File | undefined {
  const want = slashes(path)
    .split("/")
    .filter((s) => s && s !== "." && s !== "..");
  let best: { file: File; score: number } | undefined;
  for (const f of folder) {
    const have = slashes(f.webkitRelativePath || f.name).split("/");
    let score = 0;
    while (
      score < want.length &&
      score < have.length &&
      want[want.length - 1 - score].toLowerCase() ===
        have[have.length - 1 - score].toLowerCase()
    ) {
      score++;
    }
    if (score > 0 && (!best || score > best.score)) best = { file: f, score };
  }
  return best?.file;
}

/** The bytes of an embedded attachment. */
export function inlineBlob(body: InlineBody, contentType?: string): Blob {
  if (body.encoding === "text")
    return new Blob([body.data], { type: contentType ?? "text/plain" });
  const bin = atob(body.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: contentType ?? "application/octet-stream" });
}

export interface AttachResult {
  attached: number;
  /** Attachments the report names but whose file was not found. */
  missing: string[];
  failed: number;
}

/** Sends the report's attachments to their results, one at a time (each is
 *  idempotent, so a re-import completes what an interrupted one left). */
export async function attachAll(
  report: ReadReport,
  outcome: ReportImportOutcome,
  folder: readonly File[],
  userId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<AttachResult> {
  const byRef = new Map<string, ImportAttachment>(
    report.parsed.doc.attachments.map((a) => [a.ref, a]),
  );
  const out: AttachResult = { attached: 0, missing: [], failed: 0 };
  const total = outcome.attachments.length;
  let done = 0;
  for (const target of outcome.attachments) {
    const a = byRef.get(target.ref);
    const inline = report.parsed.inline.get(target.ref);
    const blob = inline
      ? inlineBlob(inline, a?.contentType)
      : a?.path
        ? matchAttachment(a.path, folder)
        : undefined;
    if (!a || !blob) {
      if (a) out.missing.push(a.path ?? a.name);
    } else {
      try {
        await runsApi.attach(
          target.ownerEntity,
          target.ownerId,
          blob,
          a.name,
          a.contentType ?? (blob.type || undefined),
          a.kind,
          userId,
        );
        out.attached++;
      } catch {
        out.failed++;
      }
    }
    onProgress?.(++done, total);
  }
  return out;
}
