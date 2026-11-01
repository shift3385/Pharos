import { ReportError } from "@shared/contracts/pharos-run/importers";

/** The i18n key of an import error: a parser's `ReportError`, or the code at
 *  the start of the desktop's message (`already-imported: RUN-004`). */
export function importErrorKey(e: unknown): { key: string; detail?: string } {
  if (e instanceof ReportError) return { key: `runs.import.error.${e.code}` };
  const text = e instanceof Error ? e.message : String(e);
  const m = /^([a-z-]+)(?::\s*(.*))?$/s.exec(text);
  const known = [
    "already-imported",
    "run-closed",
    "report-changed",
    "too-large",
    "unsupported-version",
    "invalid-report",
    "steps-too-many",
    "evidence-too-large",
    "project-not-found",
    "test-key-required",
    "unknown-format",
    "invalid-sha256",
    "invalid-shard",
    "invalid-target",
  ];
  if (m && known.includes(m[1]))
    return { key: `runs.import.error.${m[1]}`, detail: m[2] };
  return { key: "runs.import.error.generic", detail: text };
}
