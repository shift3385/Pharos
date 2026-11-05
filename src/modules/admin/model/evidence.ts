// The evidence store's usage and «Verificar evidencias» report (DAT-03b). The
// shapes are the Rust ones as generated (evidence/check.rs): the UI only reads
// them, so it takes them as they are.

import type { Contract } from "@shared/contracts";

export type EvidenceUsage = Contract.EvidenceUsage;
export type EvidenceReport = Contract.EvidenceReport;
export type EvidenceProgress = Contract.EvidenceProgress;
export type EvidenceDeleted = Contract.EvidenceDeleted;
export type EvidenceOrphan = Contract.EvidenceOrphan;
export type EvidenceProblem = Contract.EvidenceProblem;

/** `1,2 MB` in the UI language (base 1024, as the 200 MB limit). */
export function formatBytes(bytes: number, lang: string): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const n = new Intl.NumberFormat(lang, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value);
  return `${n} ${units[unit]}`;
}
